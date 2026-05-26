import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

// Initialize paths and environment variables
const REPO_ROOT = process.cwd();
dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, 'sveltekit-frontend/.env') });

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';

// Generic headings to avoid key collisions
const GENERIC_HEADINGS = new Set([
  'todo', 'todos', 'tasks', 'checklist', 'notes', 'setup', 'verification', 
  'run', 'tests', 'missing', 'done', 'in_progress', 'general', 'summary', 
  'introduction', 'overview', 'details', 'next_steps', 'nextsteps', 'root', 
  'file_root', '[file root]', 'checklist_items', 'todo_list'
]);

// Helper to slugify text
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Ignore directories configuration
let ignoreDirs = new Set(['node_modules', '.git', '.svelte-kit', 'dist', 'build', 'coverage', '.cache', 'tmp', 'target', 'backups']);
try {
  const configPath = path.join(REPO_ROOT, 'atlas.config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.ignoreDirs && Array.isArray(config.ignoreDirs)) {
      ignoreDirs = new Set([...ignoreDirs, ...config.ignoreDirs]);
    }
  }
} catch (e) {
  console.warn('[warning] Failed to read atlas.config.json, using default ignore directories.');
}

// Collect .md and .txt files recursively
function collectFiles(dir: string, filesList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return filesList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    // Skip hidden files/directories unless it's .opencode
    if (entry.name.startsWith('.') && entry.name !== '.opencode') continue;
    if (ignoreDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, filesList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.md' || ext === '.txt') {
        filesList.push(fullPath);
      }
    }
  }
  return filesList;
}

interface CheckboxTask {
  checkboxText: string;
  lineNumber: number;
  sourceRef: string;
  status: 'implemented' | 'partial' | 'missing';
  priority: 'high' | 'medium' | 'low';
  suggestedCommand: string;
}

interface FeatureBlock {
  featureKey: string;
  title: string;
  description: string;
  status: 'implemented' | 'partial' | 'missing' | 'blocked';
  sourceRefs: string[];
  codeRefs: string[];
  testRefs: string[];
  clusterId: number;
  tasks: CheckboxTask[];
}

// Clean markdown/text lines to form description
function cleanLineForDescription(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('#') || trimmed.match(/^\s*[-*+0-9.]*\s*\[[ xX•/]\]/) || trimmed === '') {
    return '';
  }
  return trimmed.replace(/^>\s*/, '').replace(/[*_`]/g, '');
}

// Main logic
async function main() {
  console.log('📡 Scanning for files...');
  const files = collectFiles(REPO_ROOT);
  console.log(`🔍 Found ${files.length} markdown/text files to inspect.`);

  const featuresMap = new Map<string, FeatureBlock>();
  const usedKeys = new Set<string>();

  for (const filePath of files) {
    const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const fileSlug = slugify(path.basename(filePath, path.extname(filePath)));
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');

    let currentHeadingText = '[File Root]';
    let currentHeadingSlug = 'root';
    let currentDescriptionLines: string[] = [];
    let currentTasks: CheckboxTask[] = [];
    let currentCodeRefs = new Set<string>();
    let currentTestRefs = new Set<string>();

    const headingGroups: { 
      headingText: string; 
      headingSlug: string; 
      lines: string[];
      startIndex: number;
    }[] = [];

    // First pass: identify headings and their line boundaries
    let currentGroup: typeof headingGroups[0] | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
      
      if (headingMatch) {
        if (currentGroup) {
          headingGroups.push(currentGroup);
        }
        currentGroup = {
          headingText: headingMatch[1].trim(),
          headingSlug: slugify(headingMatch[1].trim()),
          lines: [],
          startIndex: i
        };
      } else {
        if (!currentGroup) {
          currentGroup = {
            headingText: '[File Root]',
            headingSlug: 'root',
            lines: [],
            startIndex: 0
          };
        }
        currentGroup.lines.push(line);
      }
    }
    if (currentGroup) {
      headingGroups.push(currentGroup);
    }

    // Second pass: parse each heading group
    for (const group of headingGroups) {
      const tasks: CheckboxTask[] = [];
      const codeRefs = new Set<string>();
      const testRefs = new Set<string>();
      const descLines: string[] = [];

      for (let j = 0; j < group.lines.length; j++) {
        const line = group.lines[j];
        const lineNumber = group.startIndex + j + 1;

        // Check for checkbox match
        const checkboxMatch = line.match(/^\s*[-*+0-9.]*\s*\[([ xX•/-])\]\s*(.*)$/);
        if (checkboxMatch) {
          const statusChar = checkboxMatch[1];
          const taskText = checkboxMatch[2].trim();
          
          let taskStatus: 'implemented' | 'partial' | 'missing' = 'missing';
          if (statusChar.toLowerCase() === 'x') {
            taskStatus = 'implemented';
          } else if (statusChar === '•' || statusChar === '/' || statusChar === '-') {
            taskStatus = 'partial';
          }

          let priority: 'high' | 'medium' | 'low' = 'medium';
          const taskTextLower = taskText.toLowerCase();
          if (taskTextLower.includes('high') || taskTextLower.includes('critical') || taskTextLower.includes('urgent')) {
            priority = 'high';
          } else if (taskTextLower.includes('low') || taskTextLower.includes('minor') || taskTextLower.includes('nice to have')) {
            priority = 'low';
          }

          const safeTaskText = taskText.replace(/"/g, '\\"');
          const suggestedCommand = `rg "${safeTaskText}" src docs tests`;

          const sha256 = crypto.createHash('sha256').update(taskText).digest('hex').slice(0, 16);
          const sourceRef = `local:${relativePath}#L${lineNumber}-sha256:${sha256}`;

          tasks.push({
            checkboxText: taskText,
            lineNumber,
            sourceRef,
            status: taskStatus,
            priority,
            suggestedCommand
          });
        } else {
          const cleaned = cleanLineForDescription(line);
          if (cleaned) {
            descLines.push(cleaned);
          }
        }

        // Search for file references on the line
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(line)) !== null) {
          const dest = match[2].trim();
          if (dest.includes('.') && !dest.startsWith('http') && !dest.startsWith('#')) {
            // Remove file:/// scheme if present
            const cleanPath = dest.replace(/^file:\/\/\/?/, '');
            const possiblePath = path.resolve(REPO_ROOT, cleanPath);
            if (fs.existsSync(possiblePath)) {
              const relRef = path.relative(REPO_ROOT, possiblePath).replace(/\\/g, '/');
              if (relRef.toLowerCase().includes('test') || relRef.toLowerCase().includes('spec')) {
                testRefs.add(relRef);
              } else {
                codeRefs.add(relRef);
              }
            }
          }
        }

        // Also search for plain relative code paths matching typical extensions
        const pathRegex = /\b([\w\-./\\]+\.(?:ts|tsx|js|mjs|cjs|svelte|py|cc|cpp|h|hpp|go|rs|sql|json))\b/g;
        let pMatch;
        while ((pMatch = pathRegex.exec(line)) !== null) {
          const dest = pMatch[1];
          const possiblePath = path.resolve(REPO_ROOT, dest);
          if (fs.existsSync(possiblePath)) {
            const relRef = path.relative(REPO_ROOT, possiblePath).replace(/\\/g, '/');
            if (relRef.toLowerCase().includes('test') || relRef.toLowerCase().includes('spec')) {
              testRefs.add(relRef);
            } else {
              codeRefs.add(relRef);
            }
          }
        }
      }

      // Skip groups that have no checkboxes AND the heading is generic file root
      if (tasks.length === 0 && group.headingSlug === 'root') {
        // Only keep if the file contains no checkboxes at all, in which case we represent the whole file as a single root feature
        const fileHasAnyCheckboxes = fileContent.match(/\[([ xX•/-])\]/);
        if (fileHasAnyCheckboxes) continue;
      }

      // Generate unique key
      let featureKey = group.headingSlug;
      if (GENERIC_HEADINGS.has(featureKey) || featureKey === 'root') {
        featureKey = `${fileSlug}__${featureKey}`;
      } else if (usedKeys.has(featureKey)) {
        featureKey = `${fileSlug}__${featureKey}`;
      }
      usedKeys.add(featureKey);

      // Determine feature status
      let featureStatus: 'implemented' | 'partial' | 'missing' | 'blocked' = 'implemented';
      if (tasks.length > 0) {
        const isBlocked = tasks.some(t => t.checkboxText.toLowerCase().includes('blocked') || t.checkboxText.toLowerCase().includes('hold'));
        if (isBlocked) {
          featureStatus = 'blocked';
        } else {
          const doneCount = tasks.filter(t => t.status === 'implemented').length;
          if (doneCount === tasks.length) {
            featureStatus = 'implemented';
          } else if (doneCount === 0) {
            featureStatus = 'missing';
          } else {
            featureStatus = 'partial';
          }
        }
      }

      // Group by folder mapping to cluster ID
      let clusterId = 6; // default general
      const absPath = filePath.replace(/\\/g, '/');
      if (absPath.includes('/db/') || absPath.includes('/schema/') || absPath.includes('/drizzle/')) {
        clusterId = 1; // database_schema
      } else if (absPath.includes('/routes/') || absPath.includes('/api/') || absPath.includes('/frontend/')) {
        clusterId = 2; // frontend_routes
      } else if (absPath.includes('/simd/') || absPath.includes('/bridge/') || absPath.includes('/native/') || absPath.includes('/cpp/')) {
        clusterId = 3; // native_simd
      } else if (absPath.includes('/services/') || absPath.includes('/server/')) {
        clusterId = 4; // backend_services
      } else if (absPath.includes('/docs/') || absPath.includes('/llm/') || absPath.includes('/wiki/')) {
        clusterId = 5; // documentation
      }

      // Clean up description and summary
      const desc = descLines.slice(0, 5).join(' ').trim();
      const description = desc || `Feature documentation located in ${relativePath}`;

      featuresMap.set(featureKey, {
        featureKey,
        title: group.headingText === '[File Root]' ? path.basename(filePath, path.extname(filePath)) : group.headingText,
        description,
        status: featureStatus,
        sourceRefs: [`local:${relativePath}#L${group.startIndex + 1}`],
        codeRefs: Array.from(codeRefs),
        testRefs: Array.from(testRefs),
        clusterId,
        tasks
      });
    }
  }

  console.log(`📦 Extracted ${featuresMap.size} distinct features.`);

  // Load agent progress logs
  console.log('📜 Loading agent progress logs...');
  const progressLogPath = path.join(REPO_ROOT, 'docs/ai-os/agentic-progress-log.ndjson');
  const progressLogs: any[] = [];
  try {
    if (fs.existsSync(progressLogPath)) {
      const rawLog = fs.readFileSync(progressLogPath, 'utf8');
      const lines = rawLog.split('\n').filter(Boolean);
      for (const line of lines) {
        progressLogs.push(JSON.parse(line));
      }
      console.log(`💡 Loaded ${progressLogs.length} historical progress log entries.`);
    } else {
      console.warn(`[warning] Progress log not found at ${progressLogPath}.`);
    }
  } catch (e: any) {
    console.error(`[error] Failed to load progress logs: ${e.message}`);
  }

  // Generate output files
  console.log('💾 Writing JSON reports...');
  
  // 1. docs/atlas/feature-registry.json
  const registryOutput = Array.from(featuresMap.values()).map(f => {
    const doneCount = f.tasks.filter(t => t.status === 'implemented').length;
    const summary = f.description || `Feature contains ${f.tasks.length} sub-tasks (${doneCount} completed, ${f.tasks.length - doneCount} remaining).`;
    const missing = f.tasks.filter(t => t.status !== 'implemented').map(t => t.checkboxText);
    const nextQuery = f.tasks.filter(t => t.status !== 'implemented')[0]?.suggestedCommand || `rg "${f.title}" src docs tests`;

    return {
      featureKey: f.featureKey,
      title: f.title,
      status: f.status,
      summary,
      sourceRefs: f.sourceRefs.concat(f.tasks.map(t => t.sourceRef)),
      codeRefs: f.codeRefs,
      testRefs: f.testRefs,
      missing,
      nextQuery
    };
  });

  const atlasDir = path.join(REPO_ROOT, 'docs/atlas');
  if (!fs.existsSync(atlasDir)) {
    fs.mkdirSync(atlasDir, { recursive: true });
  }

  fs.writeFileSync(path.join(atlasDir, 'feature-registry.json'), JSON.stringify(registryOutput, null, 2), 'utf8');
  console.log(`  - Wrote ${registryOutput.length} feature cards to docs/atlas/feature-registry.json`);

  // 2. docs/atlas/missing-feature-atlas.json
  const missingFeatures = registryOutput.filter(f => f.status === 'missing' || f.status === 'partial' || f.status === 'blocked');
  const missingAtlas = {
    generatedAt: new Date().toISOString(),
    missingCount: missingFeatures.filter(f => f.status === 'missing').length,
    partialCount: missingFeatures.filter(f => f.status === 'partial').length,
    blockedCount: missingFeatures.filter(f => f.status === 'blocked').length,
    features: missingFeatures
  };
  fs.writeFileSync(path.join(atlasDir, 'missing-feature-atlas.json'), JSON.stringify(missingAtlas, null, 2), 'utf8');
  console.log(`  - Wrote ${missingFeatures.length} missing/partial features to docs/atlas/missing-feature-atlas.json`);

  // 3. docs/atlas/agent-retry-queries.json
  const retryEntries = progressLogs
    .filter(e => ['failed', 'partial', 'blocked', 'retry_needed'].includes(e.status))
    .map(e => ({
      featureKey: e.featureKey,
      status: e.status,
      summary: e.summary || e.problem,
      errorSignature: e.errorSignature,
      retryQuery: e.nextAttempt?.query || `where ${e.featureKey} is configured`,
      lastAttempted: e.date,
      commandsRun: e.commandsRun || [],
      filesChanged: e.filesTouched || []
    }));

  fs.writeFileSync(path.join(atlasDir, 'agent-retry-queries.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: retryEntries.length,
    retries: retryEntries
  }, null, 2), 'utf8');
  console.log(`  - Wrote ${retryEntries.length} retry mappings to docs/atlas/agent-retry-queries.json`);

  // Database Connection and Upsert
  console.log(`📡 Connecting to PostgreSQL at ${DB_URL.replace(/:[^:@\s]+@/, ':****@')}...`);
  const pool = new Pool({
    connectionString: DB_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to database. Synchronizing tables...');

    // 1. Sync feature_registry
    console.log('🔄 Upserting features into feature_registry...');
    let registryUpsertCount = 0;
    for (const f of featuresMap.values()) {
      const sourceRefsJson = JSON.stringify(f.sourceRefs.concat(f.tasks.map(t => t.sourceRef)));
      const codeRefsJson = JSON.stringify(f.codeRefs);
      const testRefsJson = JSON.stringify(f.testRefs);

      await client.query(`
        INSERT INTO feature_registry (
          feature_key, title, description, status, source_refs, code_refs, test_refs, cluster_id, trust_tier, last_verified_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, NOW())
        ON CONFLICT (feature_key) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          source_refs = EXCLUDED.source_refs,
          code_refs = EXCLUDED.code_refs,
          test_refs = EXCLUDED.test_refs,
          cluster_id = EXCLUDED.cluster_id,
          trust_tier = EXCLUDED.trust_tier,
          last_verified_at = NOW()
      `, [f.featureKey, f.title, f.description, f.status, sourceRefsJson, codeRefsJson, testRefsJson, f.clusterId, 'local_docs']);
      registryUpsertCount++;
    }
    console.log(`  - Successfully upserted ${registryUpsertCount} features in database.`);

    // 2. Sync feature_tasks (Clean & Insert)
    console.log('🔄 Syncing tasks in feature_tasks...');
    await client.query('DELETE FROM feature_tasks');
    
    let taskInsertCount = 0;
    for (const f of featuresMap.values()) {
      for (const t of f.tasks) {
        await client.query(`
          INSERT INTO feature_tasks (
            feature_key, checkbox_text, source_ref, status, priority, suggested_command, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [f.featureKey, t.checkboxText, t.sourceRef, t.status, t.priority, t.suggestedCommand]);
        taskInsertCount++;
      }
    }
    console.log(`  - Successfully registered ${taskInsertCount} checkbox tasks in database.`);

    // 3. Sync agent_progress_log
    console.log('🔄 Upserting historical progress logs in agent_progress_log...');
    let progressUpsertCount = 0;
    for (const log of progressLogs) {
      if (!log.id || !log.featureKey) continue;
      
      const queryText = log.summary || log.problem || log.nextAttempt?.query || 'unknown';
      const attemptedFix = log.fixApplied || null;
      const errorSig = log.errorSignature || null;
      const commandsRunJson = JSON.stringify(log.commandsRun || []);
      const filesChangedJson = JSON.stringify(log.filesTouched || []);
      const retryQueryText = log.nextAttempt?.query || null;
      const createdAtVal = log.date ? new Date(log.date) : new Date();

      // Check if entry exists by runId
      const existsCheck = await client.query('SELECT id FROM agent_progress_log WHERE run_id = $1', [log.id]);
      if (existsCheck.rows.length > 0) {
        await client.query(`
          UPDATE agent_progress_log SET
            feature_key = $2,
            query = $3,
            attempted_fix = $4,
            result = $5,
            error_signature = $6,
            commands_run = $7::jsonb,
            files_changed = $8::jsonb,
            retry_query = $9,
            created_at = $10
          WHERE run_id = $1
        `, [log.id, log.featureKey, queryText, attemptedFix, log.status, errorSig, commandsRunJson, filesChangedJson, retryQueryText, createdAtVal]);
      } else {
        await client.query(`
          INSERT INTO agent_progress_log (
            run_id, feature_key, query, attempted_fix, result, error_signature, commands_run, files_changed, retry_query, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
        `, [log.id, log.featureKey, queryText, attemptedFix, log.status, errorSig, commandsRunJson, filesChangedJson, retryQueryText, createdAtVal]);
      }
      progressUpsertCount++;
    }
    console.log(`  - Successfully mapped ${progressUpsertCount} progress entries to agent_progress_log in database.`);

    client.release();
    console.log('🎉 Database synchronization completed successfully.');
  } catch (err: any) {
    console.error(`❌ Database operation failed: ${err.message}`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal Error during execution:', err);
  process.exit(1);
});
