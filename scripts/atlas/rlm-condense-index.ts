import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import pkg from 'pg';
import dotenv from 'dotenv';
import Redis from 'ioredis';

const { Pool } = pkg;

// Initialize paths and environment variables
const REPO_ROOT = process.cwd();
dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, 'sveltekit-frontend/.env') });

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
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

// Clean string to remove PostgreSQL null byte encoding issue (0x00)
function cleanStr(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\u0000/g, '');
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
  chunkIds: string[];
  tags: string[];
}

// Clean lines to build descriptions
function cleanLineForDescription(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('#') || trimmed.match(/^\s*[-*+0-9.]*\s*\[[ xX•/]\]/) || trimmed === '') {
    return '';
  }
  return trimmed.replace(/^>\s*/, '').replace(/[*_`]/g, '');
}

// Extract tags from headings/filenames
function extractTags(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 3 && !['with', 'from', 'this', 'that', 'under', 'here', 'into', 'feature', 'checklist'].includes(w));
}

// Ollama embedding helper
async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.embedding ?? null;
  } catch {
    return null;
  }
}

// Qdrant collection ensure helper
async function ensureQdrantCollection(name: string, vectorSize: number) {
  try {
    const check = await fetch(`${QDRANT_URL}/collections/${name}`, { signal: AbortSignal.timeout(2000) });
    if (check.status === 200) return true;

    const r = await fetch(`${QDRANT_URL}/collections/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: vectorSize, distance: 'Cosine' },
      }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Qdrant upsert points helper
async function upsertQdrantPoints(collection: string, points: any[]) {
  try {
    const r = await fetch(`${QDRANT_URL}/collections/${collection}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// UUID helper derived from feature key
function generateUuid(key: string): string {
  const hash = crypto.createHash('md5').update(key).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

async function main() {
  console.log('📡 [RLM] Scanning files...');
  let scanRoots = ['docs', 'llm', 'scripts', 'sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'sveltekit-frontend/tests', 'simd-bridge', 'vscode-extension'];
  try {
    const configPath = path.join(REPO_ROOT, 'atlas.config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.scanRoots && Array.isArray(config.scanRoots)) {
        scanRoots = Array.from(new Set([...scanRoots, ...config.scanRoots]));
      }
    }
  } catch (e) {
    // Ignore fallback
  }

  const files: string[] = [];
  for (const root of scanRoots) {
    const fullRootPath = path.resolve(REPO_ROOT, root);
    if (fs.existsSync(fullRootPath)) {
      if (fs.statSync(fullRootPath).isDirectory()) {
        collectFiles(fullRootPath, files);
      } else {
        files.push(fullRootPath);
      }
    }
  }
  console.log(`🔍 [RLM] Scanning ${files.length} markdown and text files in scan roots.`);

  const featuresMap = new Map<string, FeatureBlock>();
  const usedKeys = new Set<string>();

  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    if (stat.size > 1500000) {
      // console.log(`   - Skipping too large file: ${filePath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      continue;
    }
    const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const fileSlug = slugify(path.basename(filePath, path.extname(filePath)));
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');

    const headingGroups: { 
      headingText: string; 
      headingSlug: string; 
      lines: string[];
      startIndex: number;
    }[] = [];

    let currentGroup: typeof headingGroups[0] | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
      
      if (headingMatch) {
        if (currentGroup) headingGroups.push(currentGroup);
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
    if (currentGroup) headingGroups.push(currentGroup);

    for (const group of headingGroups) {
      const tasks: CheckboxTask[] = [];
      const codeRefs = new Set<string>();
      const testRefs = new Set<string>();
      const descLines: string[] = [];
      const chunkIds: string[] = [];

      for (let j = 0; j < group.lines.length; j++) {
        const line = group.lines[j];
        const lineNumber = group.startIndex + j + 1;

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
          
          chunkIds.push(sha256);

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
          if (cleaned) descLines.push(cleaned);
        }

        // Parse file references
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(line)) !== null) {
          const dest = match[2].trim();
          if (dest.includes('.') && !dest.startsWith('http') && !dest.startsWith('#')) {
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

      // Root default exclusion if empty checklist
      if (tasks.length === 0 && group.headingSlug === 'root') {
        const hasAnyCheckboxes = fileContent.match(/\[([ xX•/-])\]/);
        if (hasAnyCheckboxes) continue;
      }

      let featureKey = group.headingSlug;
      if (GENERIC_HEADINGS.has(featureKey) || featureKey === 'root') {
        featureKey = `${fileSlug}__${featureKey}`;
      } else if (usedKeys.has(featureKey)) {
        featureKey = `${fileSlug}__${featureKey}`;
      }
      usedKeys.add(featureKey);

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

      let clusterId = 6;
      const absPath = filePath.replace(/\\/g, '/');
      if (absPath.includes('/db/') || absPath.includes('/schema/') || absPath.includes('/drizzle/')) {
        clusterId = 1;
      } else if (absPath.includes('/routes/') || absPath.includes('/api/') || absPath.includes('/frontend/')) {
        clusterId = 2;
      } else if (absPath.includes('/simd/') || absPath.includes('/bridge/') || absPath.includes('/native/') || absPath.includes('/cpp/')) {
        clusterId = 3;
      } else if (absPath.includes('/services/') || absPath.includes('/server/')) {
        clusterId = 4;
      } else if (absPath.includes('/docs/') || absPath.includes('/llm/') || absPath.includes('/wiki/')) {
        clusterId = 5;
      }

      const desc = descLines.slice(0, 5).join(' ').trim();
      const description = desc || `Feature documentation located in ${relativePath}`;
      const title = group.headingText === '[File Root]' ? path.basename(filePath, path.extname(filePath)) : group.headingText;
      const tags = Array.from(new Set(extractTags(title).concat(extractTags(fileSlug))));

      featuresMap.set(featureKey, {
        featureKey,
        title,
        description,
        status: featureStatus,
        sourceRefs: [`local:${relativePath}#L${group.startIndex + 1}`],
        codeRefs: Array.from(codeRefs),
        testRefs: Array.from(testRefs),
        clusterId,
        tasks,
        chunkIds,
        tags
      });
    }
  }

  // Load progress logs
  const progressLogPath = path.join(REPO_ROOT, 'docs/ai-os/agentic-progress-log.ndjson');
  const progressLogs: any[] = [];
  try {
    if (fs.existsSync(progressLogPath)) {
      const raw = fs.readFileSync(progressLogPath, 'utf8');
      for (const line of raw.split('\n').filter(Boolean)) {
        progressLogs.push(JSON.parse(line));
      }
    }
  } catch (e: any) {
    console.error('[RLM] Failed loading progress logs:', e.message);
  }

  // Map retry queries
  const retryMap = new Map<string, string[]>();
  const logRetries = progressLogs
    .filter(e => ['failed', 'partial', 'blocked', 'retry_needed'].includes(e.status))
    .map(e => {
      const queryText = e.nextAttempt?.query || `where ${e.featureKey} is configured`;
      if (!retryMap.has(e.featureKey)) retryMap.set(e.featureKey, []);
      retryMap.get(e.featureKey)!.push(queryText);
      return {
        featureKey: e.featureKey,
        status: e.status,
        summary: e.summary || e.problem,
        errorSignature: e.errorSignature,
        retryQuery: queryText,
        lastAttempted: e.date,
        commandsRun: e.commandsRun || [],
        filesChanged: e.filesTouched || []
      };
    });

  // Database Connection
  console.log(`📡 [RLM] Connecting to PostgreSQL at ${DB_URL.replace(/:[^:@\s]+@/, ':****@')}...`);
  const pool = new Pool({ connectionString: DB_URL, max: 4 });
  let dbActive = false;

  try {
    const client = await pool.connect();
    dbActive = true;
    console.log('✅ [RLM] Postgres connected. Setting up fuzzy pg_trgm indices...');
    
    // Create extension and indices
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    await client.query('CREATE INDEX IF NOT EXISTS feature_registry_title_trgm ON feature_registry USING gin (title gin_trgm_ops);');
    await client.query('CREATE INDEX IF NOT EXISTS feature_registry_summary_trgm ON feature_registry USING gin (summary gin_trgm_ops);');
    console.log('   - pg_trgm fuzzy indices verified.');

    // 1. Sync feature_registry
    console.log('   - Upserting registry cards...');
    for (const f of featuresMap.values()) {
      const allSourceRefs = f.sourceRefs.concat(f.tasks.map(t => t.sourceRef));
      const retryQueries = retryMap.get(f.featureKey) ?? [];
      
      await client.query(`
        INSERT INTO feature_registry (
          feature_key, title, description, status, summary, source_refs, chunk_ids, tags, code_refs, test_refs, retry_queries, cluster_id, trust_tier, last_verified_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, NOW())
        ON CONFLICT (feature_key) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          summary = EXCLUDED.summary,
          source_refs = EXCLUDED.source_refs,
          chunk_ids = EXCLUDED.chunk_ids,
          tags = EXCLUDED.tags,
          code_refs = EXCLUDED.code_refs,
          test_refs = EXCLUDED.test_refs,
          retry_queries = EXCLUDED.retry_queries,
          cluster_id = EXCLUDED.cluster_id,
          trust_tier = EXCLUDED.trust_tier,
          last_verified_at = NOW()
      `, [
        cleanStr(f.featureKey), cleanStr(f.title), cleanStr(f.description), cleanStr(f.status), cleanStr(f.description), 
        JSON.stringify(allSourceRefs.map(cleanStr)), JSON.stringify(f.chunkIds.map(cleanStr)), JSON.stringify(f.tags.map(cleanStr)), 
        JSON.stringify(f.codeRefs.map(cleanStr)), JSON.stringify(f.testRefs.map(cleanStr)), JSON.stringify(retryQueries.map(cleanStr)),
        f.clusterId, 'local_docs'
      ]);
    }

    // 2. Sync feature_tasks
    console.log('   - Syncing feature tasks...');
    await client.query('DELETE FROM feature_tasks');
    for (const f of featuresMap.values()) {
      for (const t of f.tasks) {
        await client.query(`
          INSERT INTO feature_tasks (
            feature_key, checkbox_text, source_ref, status, priority, suggested_command, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [cleanStr(f.featureKey), cleanStr(t.checkboxText), cleanStr(t.sourceRef), cleanStr(t.status), cleanStr(t.priority), cleanStr(t.suggestedCommand)]);
      }
    }

    // 3. Sync agent_progress_log
    console.log('   - Syncing progress logs...');
    for (const log of progressLogs) {
      if (!log.id || !log.featureKey) continue;
      const queryText = log.summary || log.problem || log.nextAttempt?.query || 'unknown';
      const attemptedFix = log.fixApplied || null;
      const errorSig = log.errorSignature || null;
      const commandsRunJson = JSON.stringify((log.commandsRun || []).map(cleanStr));
      const filesChangedJson = JSON.stringify((log.filesTouched || []).map(cleanStr));
      const retryQueryText = log.nextAttempt?.query || null;
      const createdAtVal = log.date ? new Date(log.date) : new Date();

      const check = await client.query('SELECT id FROM agent_progress_log WHERE run_id = $1', [log.id]);
      if (check.rows.length > 0) {
        await client.query(`
          UPDATE agent_progress_log SET
            feature_key = $2, query = $3, attempted_fix = $4, result = $5, error_signature = $6,
            commands_run = $7::jsonb, files_changed = $8::jsonb, retry_query = $9, created_at = $10
          WHERE run_id = $1
        `, [cleanStr(log.id), cleanStr(log.featureKey), cleanStr(queryText), attemptedFix ? cleanStr(attemptedFix) : null, cleanStr(log.status), errorSig ? cleanStr(errorSig) : null, commandsRunJson, filesChangedJson, retryQueryText ? cleanStr(retryQueryText) : null, createdAtVal]);
      } else {
        await client.query(`
          INSERT INTO agent_progress_log (
            run_id, feature_key, query, attempted_fix, result, error_signature, commands_run, files_changed, retry_query, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
        `, [cleanStr(log.id), cleanStr(log.featureKey), cleanStr(queryText), attemptedFix ? cleanStr(attemptedFix) : null, cleanStr(log.status), errorSig ? cleanStr(errorSig) : null, commandsRunJson, filesChangedJson, retryQueryText ? cleanStr(retryQueryText) : null, createdAtVal]);
      }
    }
    client.release();
  } catch (err: any) {
    console.warn(`⚠️ [Postgres] Indexing warnings occurred: ${err.message}`);
  }

  // Redis Caching
  console.log(`📡 [RLM] Checking Redis at ${REDIS_URL}...`);
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });
  redis.on('error', () => {});

  let redisActive = false;
  try {
    await redis.connect();
    await redis.ping();
    redisActive = true;
    console.log('✅ [RLM] Redis online. Caching hot cards...');
  } catch (err: any) {
    console.warn(`⚠️ [RLM] Redis offline (${err.message}). Caching skipped.`);
  }

  // Ollama Embeddings and Qdrant Indexing
  console.log(`📡 [RLM] Checking Ollama at ${OLLAMA_URL} and Qdrant at ${QDRANT_URL}...`);
  let ollamaActive = false;
  let qdrantActive = false;
  try {
    const ollamaCheck = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1000) });
    ollamaActive = ollamaCheck.ok;
  } catch {}

  try {
    const qdrantCheck = await fetch(`${QDRANT_URL}/collections`, { signal: AbortSignal.timeout(1000) });
    qdrantActive = qdrantCheck.ok;
  } catch {}

  console.log(`📡 [RLM] Ollama online: ${ollamaActive ? '✅' : '❌'}, Qdrant online: ${qdrantActive ? '✅' : '❌'}`);

  if (ollamaActive && qdrantActive) {
    console.log('🚀 [RLM] Semantic Indexing in progress...');
    const QDRANT_COLLECTION = 'feature_registry_768';
    const collectionSetup = await ensureQdrantCollection(QDRANT_COLLECTION, 768);
    
    if (collectionSetup) {
      const qPoints: any[] = [];
      for (const f of featuresMap.values()) {
        const textToEmbed = `${f.title}: ${f.description}. Status: ${f.status}. Tasks count: ${f.tasks.length}.`;
        const vector = await getEmbedding(textToEmbed);
        if (vector) {
          qPoints.push({
            id: generateUuid(f.featureKey),
            vector,
            payload: {
              feature_key: f.featureKey,
              title: f.title,
              status: f.status,
              summary: f.description,
              source_refs: f.sourceRefs.concat(f.tasks.map(t => t.sourceRef)),
              tags: f.tags,
              code_refs: f.codeRefs,
              test_refs: f.testRefs,
              cluster_id: String(f.clusterId),
              indexed_at: new Date().toISOString()
            }
          });
        }
      }
      if (qPoints.length > 0) {
        const qOk = await upsertQdrantPoints(QDRANT_COLLECTION, qPoints);
        if (qOk) {
          console.log(`✅ [RLM] Successfully indexed ${qPoints.length} features into Qdrant collection "${QDRANT_COLLECTION}".`);
        }
      }
    }
  }

  // Generate output data
  const atlasDir = path.join(REPO_ROOT, 'docs/atlas');
  if (!fs.existsSync(atlasDir)) {
    fs.mkdirSync(atlasDir, { recursive: true });
  }

  // 1. docs/atlas/feature-registry.json
  const registryList = Array.from(featuresMap.values()).map(f => {
    const doneTasks = f.tasks.filter(t => t.status === 'implemented').length;
    const missing = f.tasks.filter(t => t.status !== 'implemented').map(t => t.checkboxText);
    const nextQuery = f.tasks.filter(t => t.status !== 'implemented')[0]?.suggestedCommand || `rg "${f.title}" src docs tests`;
    
    const card = {
      featureKey: f.featureKey,
      title: f.title,
      status: f.status,
      summary: f.description || `Feature documentation for ${f.title}`,
      sourceRefs: f.sourceRefs.concat(f.tasks.map(t => t.sourceRef)),
      missing,
      nextQuery
    };

    // Cache to Redis if active
    if (redisActive) {
      redis.set(`ace:feature:${f.featureKey}`, JSON.stringify(card), 'EX', 86400).catch(() => {});
    }

    return card;
  });
  fs.writeFileSync(path.join(atlasDir, 'feature-registry.json'), JSON.stringify(registryList, null, 2), 'utf8');
  console.log(`💾 [RLM] Saved docs/atlas/feature-registry.json`);

  // 2. docs/atlas/cluster-cards.json (L3 Cluster Cards)
  const CLUSTER_NAMES: Record<number, string> = {
    1: 'database_schema',
    2: 'frontend_routes',
    3: 'native_simd',
    4: 'backend_services',
    5: 'documentation',
    6: 'general'
  };

  const clustersMap = new Map<number, typeof registryList>();
  for (const f of featuresMap.values()) {
    if (!clustersMap.has(f.clusterId)) clustersMap.set(f.clusterId, []);
    const matchingReg = registryList.find(r => r.featureKey === f.featureKey);
    if (matchingReg) clustersMap.get(f.clusterId)!.push(matchingReg);
  }

  const clusterCards = Array.from(clustersMap.entries()).map(([clusterId, features]) => {
    const name = CLUSTER_NAMES[clusterId] ?? 'general';
    const total = features.length;
    const implemented = features.filter(f => f.status === 'implemented').length;
    const missing = features.filter(f => f.status === 'missing').length;
    const partial = features.filter(f => f.status === 'partial').length;
    const blocked = features.filter(f => f.status === 'blocked').length;

    let clusterStatus: 'implemented' | 'partial' | 'missing' | 'blocked' = 'implemented';
    if (blocked > 0) clusterStatus = 'blocked';
    else if (partial > 0 || (implemented > 0 && missing > 0)) clusterStatus = 'partial';
    else if (missing === total) clusterStatus = 'missing';

    const card = {
      clusterId: String(clusterId),
      clusterName: name,
      status: clusterStatus,
      summary: `Cluster representing ${name} feature area containing ${total} registered features (${implemented} implemented, ${partial} partial, ${missing} missing, ${blocked} blocked).`,
      features: features.map(f => f.featureKey),
      sourceRefs: Array.from(new Set(features.flatMap(f => f.sourceRefs)))
    };

    if (redisActive) {
      redis.set(`summary:cluster:${clusterId}`, JSON.stringify(card), 'EX', 86400).catch(() => {});
    }

    return card;
  });
  fs.writeFileSync(path.join(atlasDir, 'cluster-cards.json'), JSON.stringify(clusterCards, null, 2), 'utf8');
  console.log(`💾 [RLM] Saved docs/atlas/cluster-cards.json`);

  // 3. docs/atlas/parent-atlas.json (L4 Parent Atlas)
  const totalFeatures = featuresMap.size;
  const featuresList = Array.from(featuresMap.values());
  const stats = {
    totalFeatures,
    implementedFeatures: featuresList.filter(f => f.status === 'implemented').length,
    partialFeatures: featuresList.filter(f => f.status === 'partial').length,
    missingFeatures: featuresList.filter(f => f.status === 'missing').length,
    blockedFeatures: featuresList.filter(f => f.status === 'blocked').length,
    totalTasks: featuresList.reduce((acc, f) => acc + f.tasks.length, 0),
    completedTasks: featuresList.reduce((acc, f) => acc + f.tasks.filter(t => t.status === 'implemented').length, 0),
    pendingTasks: featuresList.reduce((acc, f) => acc + f.tasks.filter(t => t.status !== 'implemented').length, 0),
  };

  const parentAtlas = {
    repoName: 'deeds-web-app',
    generatedAt: new Date().toISOString(),
    summary: `YoRHa Legal Evidence AI Registry parent map. System consists of ${totalFeatures} features in ${clusterCards.length} clusters. Overall tasks: ${stats.completedTasks}/${stats.totalTasks} complete (${((stats.completedTasks/Math.max(1, stats.totalTasks)) * 100).toFixed(1)}%).`,
    stats,
    clusters: clusterCards.map(c => ({
      clusterId: c.clusterId,
      clusterName: c.clusterName,
      status: c.status,
      featuresCount: c.features.length
    }))
  };
  fs.writeFileSync(path.join(atlasDir, 'parent-atlas.json'), JSON.stringify(parentAtlas, null, 2), 'utf8');
  console.log(`💾 [RLM] Saved docs/atlas/parent-atlas.json`);

  // 4. docs/atlas/retry-queries.json
  fs.writeFileSync(path.join(atlasDir, 'retry-queries.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: logRetries.length,
    retries: logRetries
  }, null, 2), 'utf8');
  console.log(`💾 [RLM] Saved docs/atlas/retry-queries.json`);

  if (redisActive) {
    await redis.quit();
  }
  if (dbActive) {
    await pool.end();
  }

  console.log('🎉 [RLM] Indexing and condensation complete!');
}

main().catch(err => {
  console.error('Fatal Error during RLM loop execution:', err);
  process.exit(1);
});
