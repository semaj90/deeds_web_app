const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TMP = path.join(ROOT, '.tmp');
const IN_FEATURES = path.join(TMP, 'feature_labels.jsonl');
const IN_IDENT  = path.join(TMP, 'identity-catalog.jsonl');
const OUT = path.join(TMP, 'atlas-feature-registry.json');

function sha256hex(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

const KIND_MAP = {
  ui: 'component',
  database: 'db',
  db: 'db',
  llm: 'server',
  ingest: 'worker',
  gpu: 'worker',
  graph: 'server',
  auth: 'server',
  cache: 'config',
  evidence: 'server'
};

function readJsonl(p) {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch (e) { return []; }
}

function main() {
  console.log('Building atlas feature registry (CJS runner)...');
  const features = readJsonl(IN_FEATURES);
  const idents = readJsonl(IN_IDENT);

  const identByPath = new Map();
  for (const it of idents) if (it && it.normalizedValue && it.id) identByPath.set(it.normalizedValue, it.id);

  const groups = new Map();
  for (const f of features) {
    const label = f.topFeature || f.label || f.feature || 'unknown';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(f);
  }

  const out = { generatedAt: new Date().toISOString(), features: [] };

  for (const [label, items] of groups.entries()) {
    const id = sha256hex(label);
    const mappedKind = KIND_MAP[label.toLowerCase()];
    const confidence = mappedKind ? 0.8 : 0.3;
    const kind = mappedKind || 'unknown';
    const files = Array.from(new Set(items.flatMap(i => (i.files || []).map(String))));
    const sourceRefs = files.map(f => identByPath.get(f)).filter(Boolean);
    const recommendedTask = {
      title: `Review ${label} usage across codebase`,
      description: `Review files: ${files.slice(0,5).join(', ')}${files.length>5?', ...':''}`,
      why: `Feature '${label}' detected by atlas feature_labeler. Verify scope, tests, and ownership.`,
      action: 'code-review',
      validationCommand: `rg "${label}" src/ || echo 'no-op'`,
      safeNextCommand: `node scripts/opencode/verify-feature.mjs --feature ${label} --dry-run`
    };
    const entry = {
      id, label, kind, files,
      functions: [], routes: [], envVars: [], redisKeys: [], qdrantCollections: [], postgresTables: [], drizzleSchemas: [], duckdbArtifacts: [],
      sourceRefs, tests: [], errors: [], confidence, recommendedTask
    };
    if (!files.length) {
      entry.errors.push({ code: 'no_files', message: 'No files found for this feature label' });
      entry.confidence = 0.3;
    }
    out.features.push(entry);
  }

  try { fs.mkdirSync(TMP, { recursive: true }); } catch (e) {}
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote', OUT, 'with', out.features.length, 'features');
}

main();
