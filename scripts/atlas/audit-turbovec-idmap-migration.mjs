#!/usr/bin/env node
/** Read-only TurboVec 1.0 identity and persisted-format audit. */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';

const output = path.resolve(REPO_ROOT, 'docs/reports/turbovec-idmap-migration-v1.json');

function persistedIndexes() {
  try {
    const text = execFileSync('rg', ['--files', '--hidden', '--no-ignore', '-g', '*.tv', '-g', '*.tvim'], {
      cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    });
    return text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const persisted = persistedIndexes();
const probe = spawnSync(process.env.PYTHON ?? 'python', ['-c', `
import inspect, json
from importlib.metadata import version
from pathlib import Path
import numpy as np
import turbovec
from turbovec import IdMapIndex

idx = IdMapIndex(dim=8, bit_width=2)
vectors = np.eye(8, dtype=np.float32)[:3]
idx.add_with_ids(vectors, np.asarray([100, 101, 102], dtype=np.uint64))
idx.prepare()
scores, ids = idx.search(vectors[:1], 2, allowlist=np.asarray([101], dtype=np.uint64))
artifact_loads = []
for relative_path in ${JSON.stringify(persisted)}:
  absolute_path = Path(${JSON.stringify(REPO_ROOT)}) / relative_path
  for cls in (IdMapIndex, turbovec.TurboQuantIndex):
    try:
      loaded = cls.load(str(absolute_path))
      artifact_loads.append({'path': relative_path, 'loader': cls.__name__, 'status': 'LOAD_OK', 'rows': len(loaded)})
    except Exception as exc:
      artifact_loads.append({'path': relative_path, 'loader': cls.__name__, 'status': 'LOAD_FAIL', 'error': str(exc)[:300]})
print(json.dumps({
  'version': version('turbovec'),
  'idMapIndex': True,
  'nativeAllowlist': 'allowlist' in inspect.signature(IdMapIndex.search).parameters,
  'allowlistResultIds': [int(value) for value in ids[0].tolist()],
  'allowlistResultCount': int(len(ids[0])),
  'artifactLoads': artifact_loads,
}))
`], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });

let probeValue = probe.status === 0 ? JSON.parse(probe.stdout) : {
  status: 'BLOCKED',
  error: String(probe.stderr || probe.stdout).slice(0, 1000),
};
const artifactLoads = probeValue.artifactLoads ?? [];
const report = {
  schema: 'atlas.turbovec-idmap-migration-receipt.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writes: false,
  persistedIndexFiles: persisted,
  persistedFormatStatus: persisted.length
    ? artifactLoads.some((entry) => entry.status === 'LOAD_FAIL') ? 'LEGACY_ARTIFACT_REQUIRES_REBUILD' : 'ARTIFACTS_LOADABLE'
    : 'NO_REPOSITORY_TV_OR_TVIM_ARTIFACTS_FOUND',
  probe: probeValue,
  promotion: 'BLOCKED_PENDING_FULL_CORPUS_ALLOWLIST_RECALL',
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
