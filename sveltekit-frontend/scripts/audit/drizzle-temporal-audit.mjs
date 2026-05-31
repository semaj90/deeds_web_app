#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Root of sveltekit-frontend
const FRONTEND_ROOT = resolve(__dirname, '../..');
const ENV_PATH = join(FRONTEND_ROOT, '.env');
const SIDECARS_PATH = join(FRONTEND_ROOT, 'drizzle/sidecar-migrations.json');
const DRIZZLE_CONFIG_PATH = join(FRONTEND_ROOT, 'drizzle.config.ts');
const DB_SCHEMA_DIR = join(FRONTEND_ROOT, 'src/lib/server/db');

// Load environment variables manually
function loadEnv() {
  if (!existsSync(ENV_PATH)) {
    console.warn(`[WARNING] .env not found at ${ENV_PATH}, falling back to defaults`);
    return {};
  }
  const content = readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

// Extract Tables Filter from drizzle.config.ts
function loadTablesFilter() {
  if (!existsSync(DRIZZLE_CONFIG_PATH)) return [];
  const content = readFileSync(DRIZZLE_CONFIG_PATH, 'utf8');
  
  // Parse tablesFilter array using simple regex since it's statically defined
  const filterSection = content.match(/tablesFilter:\s*\[([\s\S]*?)\]/);
  if (!filterSection) return [];
  
  const rawItems = filterSection[1];
  const items = [];
  const itemRegex = /['"](!?[a-zA-Z0-9_*]+)['"]/g;
  let match;
  while ((match = itemRegex.exec(rawItems)) !== null) {
    let val = match[1];
    // Remove the negative marker '!' used by drizzle-kit config if present
    if (val.startsWith('!')) {
      val = val.slice(1);
    }
    items.push(val);
  }
  return items;
}

const tablesFilterPatterns = loadTablesFilter();

function matchesFilterPattern(tableName, patterns) {
  for (const pattern of patterns) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (tableName.startsWith(prefix)) return true;
    } else if (pattern === tableName) {
      return true;
    }
  }
  return false;
}

// Load sidecar migrations
function loadSidecars() {
  if (!existsSync(SIDECARS_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(SIDECARS_PATH, 'utf8'));
    return data.sidecars || [];
  } catch (e) {
    console.error(`[ERROR] Failed to parse sidecars file: ${e.message}`);
    return [];
  }
}

const sidecars = loadSidecars();

// Recursively find TS schema files
function getTSFiles(dir) {
  const results = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (file !== 'archived-schemas' && file !== 'meta' && file !== 'archived' && file !== 'meta_backup_20260101') {
        results.push(...getTSFiles(filePath));
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      results.push(filePath);
    }
  }
  return results;
}

// AST/Balanced scanning of schema files
function parseSchemaFiles(files) {
  const declaredTables = {};
  
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const pgTableRegex = /export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*pgTable\(\s*[\r\n\s]*['"]([^'"]+)['"]/g;
    let match;
    while ((match = pgTableRegex.exec(content)) !== null) {
      const varName = match[1];
      const dbTableName = match[2];
      
      const startIndex = pgTableRegex.lastIndex;
      let braceCount = 0;
      let insideBraces = false;
      let braceStart = -1;
      let braceEnd = -1;
      
      for (let i = startIndex; i < content.length; i++) {
        if (content[i] === '{') {
          if (!insideBraces) {
            insideBraces = true;
            braceStart = i;
          }
          braceCount++;
        } else if (content[i] === '}') {
          braceCount--;
          if (braceCount === 0 && insideBraces) {
            braceEnd = i;
            break;
          }
        }
      }
      
      let columns = [];
      if (braceStart !== -1 && braceEnd !== -1) {
        const body = content.substring(braceStart + 1, braceEnd);
        const colRegex = /([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_]+)\(\s*['"]([^'"]+)['"]/g;
        let colMatch;
        while ((colMatch = colRegex.exec(body)) !== null) {
          const propName = colMatch[1];
          const colType = colMatch[2];
          const dbColName = colMatch[3];
          
          const colStartIndex = colMatch.index;
          const remainingText = body.substring(colStartIndex, colStartIndex + 200);
          
          const notNull = remainingText.includes('.notNull(') || remainingText.includes('.notNull()');
          const isPrimary = remainingText.includes('.primaryKey(') || remainingText.includes('.primaryKey()');
          
          let defaultValue = null;
          const defaultMatch = remainingText.match(/\.default\(([^)]+)\)/);
          if (defaultMatch) {
            defaultValue = defaultMatch[1].trim();
          } else if (remainingText.includes('.defaultNow(')) {
            defaultValue = 'now()';
          } else if (remainingText.includes('.defaultRandom(')) {
            defaultValue = 'random()';
          }
          
          columns.push({
            propertyName: propName,
            dbName: dbColName,
            type: colType,
            nullable: !notNull,
            primaryKey: isPrimary,
            default: defaultValue
          });
        }
      }
      
      declaredTables[dbTableName] = {
        variableName: varName,
        file: file.replace(FRONTEND_ROOT + '/', '').replace(/\\/g, '/'),
        columns
      };
    }
  }
  return declaredTables;
}

// Code search scanner
function scanCodebaseForPatterns(frontendRoot) {
  const dirs = ['src', 'drizzle', 'scripts', 'tests'];
  const patterns = {
    user_id_fields: /uploaded_by_user_id|uploadedByUserId/i,
    uuid_user_id: /userId:\s*uuid|user_id.*uuid|uuid\('user_id'\)/i,
    owner_columns: /created_by|uploaded_by|user_id|userId|createdBy|uploadedBy/i,
    vector_dims: /vector\(|dimensions|embedding_dim|embeddingDim|768|384|1536|3072/i
  };

  const hits = {
    user_id_fields: [],
    uuid_user_id: [],
    owner_columns: [],
    vector_dims: []
  };

  function searchFile(filePath) {
    try {
      const stat = statSync(filePath);
      if (stat.size > 2 * 1024 * 1024) return; // skip > 2MB files
      const content = readFileSync(filePath, 'utf8');
      const relPath = filePath.replace(frontendRoot + '/', '').replace(/\\/g, '/');
      
      for (const [key, regex] of Object.entries(patterns)) {
        if (regex.test(content)) {
          const lines = content.split(/\r?\n/);
          lines.forEach((line, idx) => {
            if (regex.test(line)) {
              hits[key].push({
                file: relPath,
                line: idx + 1,
                content: line.trim()
              });
            }
          });
        }
      }
    } catch (e) {
      // Ignore read errors
    }
  }

  function walk(dir) {
    const list = readdirSync(dir);
    for (const file of list) {
      const p = join(dir, file);
      const stat = statSync(p);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== '.svelte-kit' && file !== 'meta' && file !== 'meta_backup_20260101') {
          walk(p);
        }
      } else {
        const ext = extname(file);
        if (['.ts', '.js', '.svelte', '.sql', '.json', '.mjs', '.cjs'].includes(ext)) {
          searchFile(p);
        }
      }
    }
  }

  for (const d of dirs) {
    const dirPath = join(frontendRoot, d);
    if (existsSync(dirPath)) {
      walk(dirPath);
    }
  }

  return hits;
}

async function main() {
  console.log('🔍 Starting Drizzle Temporal Drift Audit...');
  
  // Run Codebase Search Check
  console.log('🔎 Running codebase search scan for user field and vector dimension usages...');
  const codebaseHits = scanCodebaseForPatterns(FRONTEND_ROOT);
  console.log(`✅ Codebase Search: Found ${codebaseHits.user_id_fields.length} user_id fields hits, ${codebaseHits.uuid_user_id.length} uuid_user_id hits, ${codebaseHits.owner_columns.length} owner hits, ${codebaseHits.vector_dims.length} vector dimension hits`);
  
  console.log(`📡 Connecting to PostgreSQL at: ${DATABASE_URL.replace(/:([^:@]+)@/, ':***@')}`);
  const pool = new Pool({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 5000
  });
  
  let files = [];
  try {
    files = getTSFiles(DB_SCHEMA_DIR);
    console.log(`📂 Scanned ${files.length} schema typescript files`);
  } catch (e) {
    console.error(`[ERROR] Failed to scan schema directory: ${e.message}`);
    process.exit(1);
  }
  
  const declaredTables = parseSchemaFiles(files);
  console.log(`📦 Found ${Object.keys(declaredTables).length} declared tables in Drizzle schemas`);
  
  let client;
  try {
    client = await pool.connect();
  } catch (e) {
    console.error(`[ERROR] Failed to connect to Postgres: ${e.message}`);
    process.exit(1);
  }
  
  try {
    // 1. Fetch live tables, types, and counts
    const tablesQuery = `
      SELECT 
        c.relname AS table_name,
        c.relkind AS kind,
        (SELECT COUNT(*) FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = c.relname) AS index_count,
        (SELECT COUNT(*) FROM pg_constraint con WHERE con.conrelid = c.oid) AS constraint_count,
        (SELECT COUNT(*) FROM pg_constraint con WHERE con.confrelid = c.oid) AS ref_constraint_count,
        (SELECT COUNT(*) FROM pg_depend d WHERE d.refobjid = c.oid AND d.deptype = 'n') AS dep_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' 
        AND c.relkind IN ('r', 'v', 'p')
      ORDER BY c.relname;
    `;
    const { rows: liveTables } = await client.query(tablesQuery);
    
    // 2. Fetch live columns info
    const columnsQuery = `
      SELECT 
        table_name, 
        column_name, 
        data_type, 
        udt_name,
        is_nullable, 
        column_default 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `;
    const { rows: liveColumns } = await client.query(columnsQuery);
    
    const liveColumnsMap = {};
    for (const col of liveColumns) {
      if (!liveColumnsMap[col.table_name]) {
        liveColumnsMap[col.table_name] = [];
      }
      liveColumnsMap[col.table_name].push(col);
    }
    
    // 3. Process tables and classify
    const classifications = [];
    const gapsList = [];
    
    for (const row of liveTables) {
      const tableName = row.table_name;
      const isView = row.kind === 'v';
      
      let isEmpty = true;
      let rowCount = 0;
      if (!isView) {
        try {
          const countRes = await client.query(`SELECT exists(select 1 from "${tableName}")`);
          isEmpty = !countRes.rows[0].exists;
          if (!isEmpty) {
            const exactCount = await client.query(`SELECT COUNT(*) FROM "${tableName}"`);
            rowCount = parseInt(exactCount.rows[0].count, 10);
          }
        } catch (e) {
          // If query fails, default to empty
        }
      }
      
      const declared = declaredTables[tableName];
      const isSidecar = sidecars.some(s => s.file && s.file.includes(tableName)) || sidecars.some(s => s.reason && s.reason.includes(tableName));
      const isFiltered = matchesFilterPattern(tableName, tablesFilterPatterns);
      
      let classification = 'UNKNOWN_NEEDS_OPERATOR';
      
      if (isFiltered) {
        classification = 'FILTER_EXCLUDED';
      } else if (isView || tableName.startsWith('pg_') || tableName.startsWith('sql_')) {
        classification = 'GENERATED_OR_CACHE_TABLE';
      } else if (declared) {
        if (isSidecar) {
          classification = 'MERGED_WITH_CANONICAL';
        } else {
          classification = 'CANONICAL_DECLARED';
        }
      } else if (isSidecar) {
        classification = 'SIDECAR_SNAPSHOT_ONLY';
      } else {
        if (rowCount > 0) {
          classification = 'LIVE_UNDECLARED_ACTIVE';
        } else {
          const hasRisk = row.index_count > 1 || row.constraint_count > 0 || row.ref_constraint_count > 0 || row.dep_count > 0;
          if (hasRisk) {
            classification = 'HIGH_RISK_DO_NOT_DROP';
          } else {
            classification = 'LIVE_UNDECLARED_EMPTY';
          }
        }
      }
      
      // Analyze column drift and check against codebase hits
      const columnDrifts = [];
      if (declared && liveColumnsMap[tableName]) {
        const liveCols = liveColumnsMap[tableName];
        const declaredCols = declared.columns;
        
        for (const dc of declaredCols) {
          const lc = liveCols.find(c => c.column_name === dc.dbName);
          if (!lc) {
            columnDrifts.push({
              column: dc.dbName,
              driftType: 'COLUMN_MISSING_IN_DB',
              details: `Column declared in schema but missing in live database`
            });
          } else {
            const normDrizzleType = dc.type.toLowerCase();
            const normLiveType = lc.udt_name.toLowerCase();
            let typeMismatch = false;
            
            if (normDrizzleType === 'uuid' && normLiveType !== 'uuid') typeMismatch = true;
            if (normDrizzleType === 'integer' && normLiveType !== 'int4' && normLiveType !== 'int8' && normLiveType !== 'serial') typeMismatch = true;
            if (normDrizzleType === 'text' && normLiveType !== 'text') typeMismatch = true;
            if (normDrizzleType === 'varchar' && normLiveType !== 'varchar' && normLiveType !== 'text') typeMismatch = true;
            
            const liveNullable = lc.is_nullable === 'YES';
            const nullableMismatch = dc.nullable !== liveNullable;
            
            if (typeMismatch) {
              columnDrifts.push({
                column: dc.dbName,
                driftType: 'TYPE_DRIFT',
                details: `Type mismatch: Drizzle declared '${dc.type}', live DB is '${lc.udt_name}'`
              });
            }
            if (nullableMismatch) {
              columnDrifts.push({
                column: dc.dbName,
                driftType: 'NULLABILITY_DRIFT',
                details: `Nullable mismatch: Drizzle declared nullable=${dc.nullable}, live DB is nullable=${liveNullable}`
              });
            }
          }
        }
      }
      
      classifications.push({
        tableName,
        classification,
        rowCount,
        isView,
        dependencies: {
          indexes: row.index_count,
          constraints: row.constraint_count,
          referencingConstraints: row.ref_constraint_count,
          dependencies: row.dep_count
        },
        columnDrifts
      });
      
      if (['LIVE_UNDECLARED_ACTIVE', 'HIGH_RISK_DO_NOT_DROP', 'UNKNOWN_NEEDS_OPERATOR'].includes(classification)) {
        gapsList.push({
          tableName,
          classification,
          rowCount,
          risk: classification === 'LIVE_UNDECLARED_ACTIVE' ? 'high' : 'medium'
        });
      }
    }
    
    // Output reports
    const tmpDir = join(FRONTEND_ROOT, '.tmp');
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }
    
    // Write drizzle-temporal-audit.latest.json
    const latestPath = join(tmpDir, 'drizzle-temporal-audit.latest.json');
    writeFileSync(latestPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      classifications,
      gaps: gapsList,
      codebaseHits // Include full codebase search hits in report
    }, null, 2));
    console.log(`💾 JSON Report written to: ${latestPath}`);
    
    // Write real-gap-v3.txt
    const gapV3Path = join(tmpDir, 'real-gap-v3.txt');
    const gapV3Content = gapsList.map(g => `${g.tableName} | ${g.classification} | rows=${g.rowCount} | risk=${g.risk}`).join('\n');
    writeFileSync(gapV3Path, gapV3Content || 'NO_CRITICAL_GAPS_DETECTED');
    console.log(`💾 Gap Checklist written to: ${gapV3Path}`);
    
    // Console Summary
    console.log('\n==================================================');
    console.log('📊 DRIZZLE TEMPORAL AUDIT SUMMARY');
    console.log('==================================================');
    const counts = classifications.reduce((acc, c) => {
      acc[c.classification] = (acc[c.classification] || 0) + 1;
      return acc;
    }, {});
    
    for (const [cls, count] of Object.entries(counts)) {
      console.log(`  ${cls.padEnd(28)}: ${count}`);
    }
    
    const driftCount = classifications.reduce((acc, c) => acc + c.columnDrifts.length, 0);
    console.log(`  Column Drift Errors         : ${driftCount}`);
    
    if (gapsList.length > 0) {
      console.log('\n⚠️  OPERATOR REVIEW REQUIRED (REAL GAPS V3):');
      for (const g of gapsList) {
        console.log(`  - [${g.classification}] ${g.tableName} (rows: ${g.rowCount})`);
      }
    } else {
      console.log('\n✅ No critical undeclared active/high-risk tables detected.');
    }
    
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[ERROR] Fatal failure running temporal audit:', err);
  process.exit(1);
});
