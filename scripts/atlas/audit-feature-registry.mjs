#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const DRY_RUN = process.argv.includes('--dry-run');
const OUT_PATH = path.join(ROOT, '.tmp', 'atlas-feature-registry.json');

function deriveFeatureId(filePath) {
  const parts = filePath.replace(/\\/g, '/').split('/');
  if (parts.length > 2) {
    return parts.slice(-2).join('_').replace(/\.[^.]*$/, '');
  }
  return parts[parts.length - 1].replace(/\.[^.]*$/, '');
}

function extractEnvVarsFromText(text) {
  const envVarRe = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
  const matches = new Set();
  let m;
  while ((m = envVarRe.exec(text)) !== null) {
    matches.add(m[1]);
  }
  return Array.from(matches);
}

function extractRedisKeysFromText(text) {
  const redisRe = /redis\.[a-z]+\(['"]([^'"]+)['"]/g;
  const matches = new Set();
  let m;
  while ((m = redisRe.exec(text)) !== null) {
    matches.add(m[1]);
  }
  return Array.from(matches);
}

function extractQdrantCollectionsFromText(text) {
  const qdrantRe = /collection['":\s]+([\w_]+)/gi;
  const matches = new Set();
  let m;
  while ((m = qdrantRe.exec(text)) !== null) {
    matches.add(m[1]);
  }
  return Array.from(matches);
}

function extractPostgresTablesFromText(text) {
  const pgRe = /FROM\s+(\w+)|INSERT INTO\s+(\w+)|table[s]?\.(\w+)/gi;
  const matches = new Set();
  let m;
  while ((m = pgRe.exec(text)) !== null) {
    if (m[1]) matches.add(m[1]);
    if (m[2]) matches.add(m[2]);
    if (m[3]) matches.add(m[3]);
  }
  return Array.from(matches);
}

function extractDrizzleSchemasFromText(text) {
  const drizzleRe = /from\s+['"](.*schema[^'"]*)['"]/gi;
  const matches = new Set();
  let m;
  while ((m = drizzleRe.exec(text)) !== null) {
    matches.add(m[1]);
  }
  return Array.from(matches);
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function findGlobMatches(globPattern) {
  try {
    const cmd = `rg --files "${globPattern}"`;
    const result = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return result.split('\n').filter(Boolean).slice(0, 50).map(p => p.replace(/\\/g, '/'));
  } catch {
    return [];
  }
}

async function main() {
  console.log('\n── Audit Feature Registry ────────────────────────────────');

  const registry = {
    generatedAt: new Date().toISOString(),
    features: [],
  };

  const features = new Map();

  console.log('  Scanning routes...');
  const routeFiles = findGlobMatches('src/routes');
  for (const file of routeFiles) {
    if (!file.includes('+page.svelte') && !file.includes('+server.ts')) continue;
    const content = readFileSafe(path.join(ROOT, file));
    const featureId = deriveFeatureId(file);
    if (!features.has(featureId)) {
      features.set(featureId, {
        id: featureId,
        label: featureId.replace(/_/g, ' ').toUpperCase(),
        kind: file.includes('+server') ? 'server' : 'route',
        files: [],
        functions: [],
        routes: [],
        envVars: new Set(),
        redisKeys: new Set(),
        qdrantCollections: new Set(),
        postgresTables: new Set(),
        drizzleSchemas: new Set(),
        duckdbArtifacts: [],
        sourceRefs: [],
        tests: [],
        errors: [],
        confidence: 0.8,
      });
    }
    const feat = features.get(featureId);
    feat.files.push(file);
    feat.sourceRefs.push(file);
    if (file.includes('+server')) {
      feat.routes.push(file.replace(/\+server\.ts/, ''));
    }
    feat.envVars = new Set([...feat.envVars, ...extractEnvVarsFromText(content)]);
    feat.redisKeys = new Set([...feat.redisKeys, ...extractRedisKeysFromText(content)]);
    feat.qdrantCollections = new Set([...feat.qdrantCollections, ...extractQdrantCollectionsFromText(content)]);
    feat.postgresTables = new Set([...feat.postgresTables, ...extractPostgresTablesFromText(content)]);
    feat.drizzleSchemas = new Set([...feat.drizzleSchemas, ...extractDrizzleSchemasFromText(content)]);
  }

  console.log('  Scanning server modules...');
  const serverFiles = findGlobMatches('src/lib/server');
  for (const file of serverFiles) {
    if (!file.endsWith('.ts')) continue;
    const content = readFileSafe(path.join(ROOT, file));
    const dirName = path.dirname(file).split('/').pop() || 'server';
    const featureId = dirName.replace(/-/g, '_');
    if (!features.has(featureId)) {
      features.set(featureId, {
        id: featureId,
        label: dirName.replace(/-/g, ' ').toUpperCase(),
        kind: 'server',
        files: [],
        functions: [],
        routes: [],
        envVars: new Set(),
        redisKeys: new Set(),
        qdrantCollections: new Set(),
        postgresTables: new Set(),
        drizzleSchemas: new Set(),
        duckdbArtifacts: [],
        sourceRefs: [],
        tests: [],
        errors: [],
        confidence: 0.7,
      });
    }
    const feat = features.get(featureId);
    if (!feat.files.includes(file)) feat.files.push(file);
    if (!feat.sourceRefs.includes(file)) feat.sourceRefs.push(file);
    feat.envVars = new Set([...feat.envVars, ...extractEnvVarsFromText(content)]);
    feat.redisKeys = new Set([...feat.redisKeys, ...extractRedisKeysFromText(content)]);
    feat.qdrantCollections = new Set([...feat.qdrantCollections, ...extractQdrantCollectionsFromText(content)]);
    feat.postgresTables = new Set([...feat.postgresTables, ...extractPostgresTablesFromText(content)]);
    feat.drizzleSchemas = new Set([...feat.drizzleSchemas, ...extractDrizzleSchemasFromText(content)]);
  }

  const featureArray = Array.from(features.values()).map((f) => ({
    ...f,
    envVars: Array.from(f.envVars),
    redisKeys: Array.from(f.redisKeys),
    qdrantCollections: Array.from(f.qdrantCollections),
    postgresTables: Array.from(f.postgresTables),
    drizzleSchemas: Array.from(f.drizzleSchemas),
    recommendedTask: {
      title: `Audit and document ${f.label}`,
      why: `Feature is mapped but lacks comprehensive test coverage and documentation`,
      action: `Review ${f.files.length} file(s), add missing tests, update AGENTS.md`,
      description: `Map ${f.label} to codebase and create actionable task card`,
    },
  }));

  registry.features = featureArray.sort((a, b) => b.confidence - a.confidence);

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would write ${registry.features.length} features to ${OUT_PATH}`);
    console.log('\nSample features:');
    console.log(JSON.stringify(registry.features.slice(0, 3), null, 2));
    return;
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`\n✅ Wrote ${registry.features.length} features → ${OUT_PATH}`);
  console.log(`   Generated at: ${registry.generatedAt}`);
}

main().catch((err) => {
  console.error('[audit-feature-registry] Error:', err.message);
  process.exit(1);
});
