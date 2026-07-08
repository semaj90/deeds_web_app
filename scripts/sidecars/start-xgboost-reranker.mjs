#!/usr/bin/env node
/**
 * Start XGBoost reranker sidecar
 *
 * Exports the feature dataset from Postgres and launches the Python
 * XGBoost reranker process (scripts/sidecars/xgboost_reranker.py).
 *
 * The reranker serves HTTP on $XGBOOST_PORT (default 8094)
 * and accepts POST /rerank with { candidates: [...] }.
 *
 * Usage:
 *   node scripts/sidecars/start-xgboost-reranker.mjs
 *   node scripts/sidecars/start-xgboost-reranker.mjs --dry-run
 *   node scripts/sidecars/start-xgboost-reranker.mjs --train-only
 */

import { spawn, execSync } from 'node:child_process';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

const DRY_RUN = process.argv.includes('--dry-run');
const TRAIN_ONLY = process.argv.includes('--train-only');
const PORT = parseInt(process.env.XGBOOST_PORT ?? '8094');
const FEATURES_PATH = resolve('.', 'scripts/sidecars/xgboost_features.jsonl');
const MODEL_PATH = resolve('.', 'scripts/sidecars/xgboost_reranker.ubj');
const PY_SCRIPT = resolve('.', 'scripts/sidecars/xgboost_reranker.py');

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  XGBoost Reranker Sidecar                                        ║');
console.log(`║  Port: ${PORT}`.padEnd(68) + '║');
console.log(`║  Mode: ${DRY_RUN ? 'DRY-RUN' : TRAIN_ONLY ? 'TRAIN-ONLY' : 'FULL START'}`.padEnd(68) + '║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

async function exportFeatures() {
  console.log('  Step 1: Export feature dataset from Postgres...');
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT
        source_ref,
        packet_key,
        COALESCE(bm25_score, 0)::float               AS bm25_score,
        COALESCE(bm25_score, 0)::float               AS cosine_score,
        COALESCE(pagerank, 0)::float                 AS pagerank,
        COALESCE(som_index, -1)::int                 AS som_index,
        COALESCE(community_confidence, 0)::float     AS domain_confidence,
        CASE WHEN summary IS NOT NULL AND length(summary) > 30
             THEN LEAST(length(summary)::float / 500.0, 1.0)
             ELSE 0 END                              AS summary_quality,
        1::int                                       AS accepted_reward
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
        AND domain_class IS NOT NULL
      LIMIT 100000
    `);

    const lines = res.rows.map(r => JSON.stringify(r)).join('\n');
    fs.writeFileSync(FEATURES_PATH, lines + '\n');
    console.log(`  ✅ Exported ${res.rows.length} feature rows → ${FEATURES_PATH}`);
    return res.rows.length;
  } finally {
    client.release();
    await pgPool.end();
  }
}

function checkPython() {
  try {
    const ver = execSync('python --version 2>&1', { encoding: 'utf8' }).trim();
    console.log(`  Python: ${ver}`);
    return true;
  } catch {
    try {
      const ver = execSync('python3 --version 2>&1', { encoding: 'utf8' }).trim();
      console.log(`  Python: ${ver}`);
      return true;
    } catch {
      return false;
    }
  }
}

function writePythonScript() {
  if (fs.existsSync(PY_SCRIPT)) return;

  const py = `#!/usr/bin/env python3
"""XGBoost reranker — trained on atlas_packets features, served over HTTP."""

import json, sys, os, argparse
from http.server import HTTPServer, BaseHTTPRequestHandler

FEATURES_PATH = os.environ.get('FEATURES_PATH', 'scripts/sidecars/xgboost_features.jsonl')
MODEL_PATH    = os.environ.get('MODEL_PATH', 'scripts/sidecars/xgboost_reranker.ubj')
PORT          = int(os.environ.get('XGBOOST_PORT', '8094'))
FEATURE_COLS  = ['bm25_score', 'cosine_score', 'pagerank', 'som_index',
                 'domain_confidence', 'summary_quality']

def load_or_train():
    try:
        import xgboost as xgb
        import numpy as np
    except ImportError:
        print("  ❌ xgboost not installed: pip install xgboost numpy", file=sys.stderr)
        sys.exit(1)

    if os.path.exists(MODEL_PATH):
        print(f"  Loading model from {MODEL_PATH}")
        model = xgb.Booster()
        model.load_model(MODEL_PATH)
        return model

    print(f"  Training from {FEATURES_PATH}")
    rows = [json.loads(l) for l in open(FEATURES_PATH) if l.strip()]
    X = np.array([[r.get(c, 0) or 0 for c in FEATURE_COLS] for r in rows], dtype=np.float32)
    y = np.array([r.get('accepted_reward', 1) or 1 for r in rows], dtype=np.float32)
    groups = np.array([1] * len(rows))

    dtrain = xgb.DMatrix(X, label=y, feature_names=FEATURE_COLS)
    params = {'objective': 'rank:pairwise', 'eval_metric': 'ndcg',
              'max_depth': 6, 'eta': 0.1, 'n_jobs': -1}
    model = xgb.train(params, dtrain, num_boost_round=50,
                      evals=[(dtrain, 'train')], verbose_eval=10)
    model.save_model(MODEL_PATH)
    print(f"  ✅ Model saved to {MODEL_PATH}")
    return model

model = None

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  [{self.address_string()}] {fmt % args}")

    def do_GET(self):
        if self.path == '/health':
            body = json.dumps({'status': 'ok', 'model': os.path.exists(MODEL_PATH)}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path != '/rerank':
            self.send_response(404)
            self.end_headers()
            return
        import xgboost as xgb, numpy as np
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))
        candidates = body.get('candidates', [])
        X = np.array([[c.get(f, 0) or 0 for f in FEATURE_COLS] for c in candidates], dtype=np.float32)
        d = xgb.DMatrix(X, feature_names=FEATURE_COLS)
        scores = model.predict(d).tolist()
        results = sorted(
            [{'source_ref': c.get('source_ref'), 'packet_key': c.get('packet_key'),
              'rerank_score': s, **{k: c.get(k) for k in FEATURE_COLS}}
             for c, s in zip(candidates, scores)],
            key=lambda x: -x['rerank_score']
        )
        resp = json.dumps({'results': results}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(resp)

def main():
    global model
    p = argparse.ArgumentParser()
    p.add_argument('--train-only', action='store_true')
    p.add_argument('--port', type=int, default=PORT)
    args = p.parse_args()

    model = load_or_train()
    if args.train_only:
        print("  ✅ Training complete. Exiting (--train-only).")
        return

    server = HTTPServer(('0.0.0.0', args.port), Handler)
    print(f"  ✅ XGBoost reranker serving on http://0.0.0.0:{args.port}")
    print(f"     POST /rerank  — score candidates")
    print(f"     GET  /health  — service health")
    server.serve_forever()

if __name__ == '__main__':
    main()
`;
  fs.writeFileSync(PY_SCRIPT, py);
  console.log(`  ✅ Created Python script: ${PY_SCRIPT}`);
}

async function main() {
  try {
    const rowCount = await exportFeatures();
    if (rowCount === 0) {
      console.log('  ❌ No feature rows — run verify-xgboost-feature-dataset.mjs first');
      process.exit(1);
    }

    if (!checkPython()) {
      console.log('  ❌ Python not found — install Python 3.8+ and xgboost');
      process.exit(1);
    }

    writePythonScript();

    if (DRY_RUN) {
      console.log('\n  [DRY-RUN] Would launch:');
      console.log(`    python ${PY_SCRIPT} --port ${PORT}`);
      console.log('  Re-run without --dry-run to start the server.');
      return;
    }

    const pyBin = (() => {
      try { execSync('python --version', { stdio: 'pipe' }); return 'python'; }
      catch { return 'python3'; }
    })();

    const args = [PY_SCRIPT, '--port', String(PORT)];
    if (TRAIN_ONLY) args.push('--train-only');

    console.log(`\n  Launching: ${pyBin} ${args.join(' ')}`);
    const proc = spawn(pyBin, args, { stdio: 'inherit', env: {
      ...process.env,
      FEATURES_PATH,
      MODEL_PATH,
      XGBOOST_PORT: String(PORT),
    }});

    proc.on('error', err => {
      console.error(`\n❌ Failed to start: ${err.message}`);
      if (err.message.includes('ENOENT')) {
        console.error('  Install xgboost: pip install xgboost numpy');
      }
      process.exit(1);
    });

    proc.on('exit', code => {
      console.log(`\n  Process exited with code ${code}`);
    });

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
