#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve('..', '..');
function readIfExists(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return '';
  }
}

function parseEnv(text) {
  const vars = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]{3,})\s*=/);
    if (m) vars.add(m[1]);
  }
  return [...vars];
}

function walk(dir, extFilter) {
  const files = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let ents = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const name of ents) {
      if (name.isDirectory()) {
        if (
          ['node_modules', '.git', 'vendor', 'dist', '.svelte-kit', '.vite', 'build'].includes(
            name.name
          )
        )
          continue;
        stack.push(path.join(d, name.name));
      } else {
        const p = path.join(d, name.name);
        if (!extFilter || extFilter.includes(path.extname(name.name))) files.push(p);
      }
    }
  }
  return files;
}

function grepFiles(regex, roots) {
  const hits = new Set();
  const rootList = Array.isArray(roots) ? roots : [roots];
  for (const root of rootList) {
    const files = walk(path.resolve(root));
    for (const f of files) {
      try {
        const txt = fs.readFileSync(f, 'utf8');
        if (regex.test(txt)) hits.add(path.relative(process.cwd(), f));
      } catch (e) {}
    }
  }
  return [...hits];
}

function collectDocs(root) {
  const docs = [];
  const roots = [
    'docs',
    'reports',
    '.opencode',
    'memory',
    'sveltekit-frontend/docs',
    'sveltekit-frontend/reports',
    'sveltekit-frontend/memory',
  ];
  const exts = new Set(['.md', '.json', '.jsonl', '.txt']);

  for (const relRoot of roots) {
    const absRoot = path.join(root, relRoot);
    if (!fs.existsSync(absRoot)) continue;
    for (const rel of walk(absRoot, [...exts])) {
      const relFromRoot = path.relative(root, rel);
      if (
        !/(report|summary|analyzer|health|diff|ace|feature|atlas|graph|turbovec|qdrant|redis|knowledge|context|startup|memory)/i.test(
          relFromRoot
        )
      ) {
        continue;
      }
      docs.push(relFromRoot);
    }
  }

  return [...new Set(docs)];
}

async function main() {
  const repoRoot = path.resolve(process.cwd());
  const fastMode = process.argv.includes('--fast');
  const out = {
    featureId: 'env-module',
    generatedAt: new Date().toISOString(),
    ownerFiles: [],
    envVars: [],
    runtimeServices: [],
    sourceRefs: [],
    packageScripts: {},
    bashTools: [],
    mcpToolFiles: [],
    docArtifacts: [],
    reportArtifacts: [],
    turbovecArtifacts: [],
    storageLane: [],
    retrievalLane: [],
    dynamicHealth: {},
    missingPieces: [],
    nextSteps: [],
  };

  // read env files (compact, no secrets)
  const envText =
    readIfExists(path.join(repoRoot, '.env')) +
    '\n' +
    readIfExists(path.join(repoRoot, '.env.example')) +
    '\n' +
    readIfExists(path.join(repoRoot, '.env.local'));
  out.envVars = parseEnv(envText).filter(
    (k) => !/(SECRET|KEY|PASS|TOKEN|PASSWORD|PRIVATE)/i.test(k)
  );

  // package.json scripts
  try {
    const pkg = JSON.parse(readIfExists(path.join(repoRoot, 'package.json')) || '{}');
    out.packageScripts = pkg.scripts || {};
    if (Object.keys(out.packageScripts).length) out.sourceRefs.push('package.json:scripts');
  } catch (e) {}

  const toolScriptNames = Object.entries(out.packageScripts)
    .filter(([name]) =>
      /(?:mcp|health|startup|ace|atlas|graph|codebase|feature|redis|turbovec|engram|langextract|opencode|trace|duckdb)/i.test(
        name
      )
    )
    .map(([name, command]) => `${name} => ${command}`)
    .slice(0, 100);
  out.bashTools = toolScriptNames;
  if (toolScriptNames.length) out.sourceRefs.push('package.json:bashTools');

  // runtime matrix
  const runtime =
    readIfExists(path.join(repoRoot, 'RUNTIME_MATRIX.md')) ||
    readIfExists(path.join(repoRoot, 'docs', 'RUNTIME_MATRIX.md'));
  if (runtime) {
    const services = [];
    [
      'Ollama',
      'Qdrant',
      'Redis',
      'PostgreSQL',
      'TurboQuant',
      'Seaweed',
      'MinIO',
      'Bifrost',
      'MCP',
      'TRACE',
      'LLAMA',
      'QDRANT',
      'EMBEDDING',
    ].forEach((keyword) => {
      if (new RegExp(keyword, 'i').test(runtime)) services.push(keyword);
    });
    out.runtimeServices = [...new Set(services)];
    out.sourceRefs.push('RUNTIME_MATRIX.md');
  }

  // MCP related search
  const mcpSearchRoots = fastMode
    ? ['.opencode', 'scripts', 'sveltekit-frontend/scripts', 'docs']
    : [repoRoot];
  out.mcpToolFiles = grepFiles(/\bMCP\b|mcp\/server|TRACE_MCP_URL|FastMCP/i, mcpSearchRoots).slice(
    0,
    100
  );
  out.sourceRefs.push(...out.mcpToolFiles.slice(0, 10));

  out.docArtifacts = collectDocs(repoRoot);
  out.reportArtifacts = out.docArtifacts.filter((p) =>
    /(report|summary|analyzer|health|diff)/i.test(p)
  );
  out.turbovecArtifacts = out.docArtifacts.filter((p) =>
    /(turbovec|turboquant|embedding|qdrant)/i.test(p)
  );
  out.sourceRefs.push(...out.docArtifacts.slice(0, 20));

  // env/reference owners
  const envSearchRoots = fastMode
    ? [
        'scripts',
        'src',
        '.opencode',
        'docs',
        'sveltekit-frontend/scripts',
        'sveltekit-frontend/src',
        'sveltekit-frontend/docs',
      ]
    : [repoRoot];
  const envRefFiles = grepFiles(
    /\b(OLLAMA|QDRANT|REDIS|POSTGRES|DATABASE_URL|SEAWEED|MINIO|TURBO|BIFROST)\b/i,
    envSearchRoots
  );
  out.ownerFiles = envRefFiles.slice(0, 500);

  // storage lane detection
  if (out.envVars.includes('SEAWEED_S3_PORT') || out.envVars.includes('MINIO_PORT')) {
    out.storageLane.push('SeaweedFS/S3 (seaweed override)');
  }
  if (out.envVars.includes('MINIO_PORT')) out.storageLane.push('MinIO (legacy)');

  // retrieval lane detection
  if (out.envVars.includes('QDRANT_URL') || out.runtimeServices.includes('Qdrant'))
    out.retrievalLane.push('Qdrant (semantic)');
  if (out.envVars.includes('REDIS_URL') || out.envVars.includes('REDIS'))
    out.retrievalLane.push('Redis L1 (exact)');
  if (out.envVars.includes('BIFROST_URL') || out.envVars.includes('BIFROST'))
    out.retrievalLane.push('Bifrost L2 (semantic cache)');

  // dynamic health probes guess
  out.dynamicHealth = {
    postgres: Boolean(
      process.env.DATABASE_URL ||
        out.envVars.includes('DATABASE_URL') ||
        out.envVars.includes('PGHOST')
    ),
    redis: Boolean(
      process.env.REDIS_URL || out.envVars.includes('REDIS_URL') || out.envVars.includes('REDIS')
    ),
    qdrant: Boolean(process.env.QDRANT_URL || out.envVars.includes('QDRANT_URL')),
    ollama: Boolean(process.env.OLLAMA_URL || out.envVars.includes('OLLAMA_URL')),
  };

  if (!out.envVars.length) out.missingPieces.push('.env not present or no env keys discovered');
  if (!out.ownerFiles.length) out.missingPieces.push('No files referencing runtime envs found');
  if (!out.mcpToolFiles.length) out.missingPieces.push('No MCP tool references discovered');
  if (!out.docArtifacts.length)
    out.missingPieces.push('No startup doc/report artifacts discovered');

  out.nextSteps.push('Verify Redis/Qdrant/Postgres endpoints and credentials');
  out.nextSteps.push(
    'Publish .opencode/ace-context.json to ace:opencode:context:<hash> in Redis if available'
  );
  out.nextSteps.push('Add smoke probes for Ollama and Qdrant in scripts/opencode/probes');
  out.nextSteps.push(
    'Run npm run opencode:bootstrap to refresh startup truth and report artifacts'
  );

  // assemble patch-card per Parent Atlas shape
  const patchCard = {
    id: null,
    type: 'patch_card',
    target_file: 'scripts/opencode/get-ace-context.mjs',
    sourceRef: 'docs/opencode/ace-context.md',
    summary:
      'Make ACE context emit compact machine-readable context + patch-card for Gemma4 ingestion',
    current_behavior: [
      'scans env files',
      'finds owner files',
      'infers storage/retrieval lanes',
      'writes .opencode/ace-context.json',
    ],
    desired_behavior: [
      'preserve sourceRefs',
      'exclude generated folders',
      'emit compact JSON only',
      'write summary path instead of dumping huge output',
    ],
    constraints: [
      'do not include secrets',
      'do not index node_modules/.git/.svelte-kit/.vite',
      'do not print giant JSON to chat',
      'keep output machine-readable',
    ],
    acceptance_tests: [
      'node scripts/opencode/get-ace-context.mjs runs',
      '.opencode/ace-context.json exists',
      'output includes envVars, ownerFiles, runtimeServices, packageScripts, mcpToolFiles',
      'stdout is compact',
    ],
    related_files: out.ownerFiles.slice(0, 50),
    do_not_touch: ['.opencode/*', 'docs/opencode/ace-context.md'],
    status: 'proposed',
    supersedes: null,
    content_hash: null,
  };

  // write output files (compact)
  const outDir = path.join(repoRoot, '.opencode');
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (e) {}
  const outPath = path.join(outDir, 'ace-context.json');
  // write compact JSON (no pretty-print)
  fs.writeFileSync(outPath, JSON.stringify(out));

  // finalize patch card id & hash
  const cardText = JSON.stringify(patchCard);
  const hash = crypto.createHash('sha256').update(cardText).digest('hex');
  patchCard.id = `patch_${hash.slice(0, 12)}`;
  patchCard.content_hash = hash;

  const patchPath = path.join(outDir, 'ace-patch-card.json');
  fs.writeFileSync(patchPath, JSON.stringify(patchCard, null, 2));

  // print compact summary to stdout (machine-readable, small)
  const summary = {
    written: [path.relative(repoRoot, outPath), path.relative(repoRoot, patchPath)],
    counts: {
      ownerFiles: out.ownerFiles.length,
      envVars: out.envVars.length,
      mcpToolFiles: out.mcpToolFiles.length,
      docArtifacts: out.docArtifacts.length,
    },
    patchCardId: patchCard.id,
  };

  console.log(JSON.stringify(summary));
  console.log('Wrote:', summary.written.join(', '));
}

main().catch(err=>{ console.error(err); process.exit(1); });
