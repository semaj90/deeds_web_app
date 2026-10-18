#!/usr/bin/env python3
"""
SEARCH-GOLDEN-01 draft: builds a POOLED candidate sheet for human relevance labelling. Read-only (DB read + Ollama /api/embed), no writes except the report files.
Queries are hand-written (below); the model does not judge relevance. Pool per query = exact cosine top-10 over the RAW 768 cache (query embedded raw, per
EMB-RECIPE-DECISION-01) + Postgres FTS top-5 (ts_rank on search_vector), deduplicated and shuffled. Lane names are stored in the JSONL but hidden in the HTML.
Pooling from the embedding under test favours that embedding; the FTS lane is there to reduce that bias. Gold labels come ONLY from a human (0 not relevant, 1 partly, 2 relevant).
Run: /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/build_golden_query_candidates_v1.py
"""
import hashlib, html, json, os, random, re, time, urllib.request
from pathlib import Path
import numpy as np, psycopg

QUERIES = [
    ('code', 'how are atlas packets validated before they are written to Postgres'),
    ('code', 'where is the packet_key and source_ref identity checked'),
    ('code', 'invalidate Redis BitFrost cache keys after a database write'),
    ('code', 'Qdrant upsert of 768 dimension vectors with payload'),
    ('code', 'reciprocal rank fusion of search lanes'),
    ('code', 'embedding backfill for codebase chunks using embeddinggemma'),
    ('code', 'KMeans cluster assignment of chunks'),
    ('code', 'self organizing map grid coordinates for packets'),
    ('code', 'PageRank computation over the code graph'),
    ('code', 'Neo4j topology mirror of the packet graph'),
    ('code', 'tree-sitter parsing of source files into AST nodes'),
    ('code', 'ast-grep structural pattern matching'),
    ('code', 'llama-server chat completion with streaming'),
    ('code', 'Ornith tool calling loop'),
    ('code', 'context manifest and prompt plan for synthesis'),
    ('code', 'strict checker for citations in model output'),
    ('code', 'error_logs ingestion and repair task creation'),
    ('code', 'kanban task board for agent work items'),
    ('code', 'daily graphify chain steps'),
    ('code', 'domain classification of source files into taxonomy groups'),
    ('code', 'ontology concepts and entities extraction'),
    ('code', 'GPU memory headroom check before CUDA work'),
    ('code', 'LibTorch cosine similarity batch on GPU'),
    ('code', 'simdjson parsing of NDJSON'),
    ('code', 'SvelteKit API route with Zod validation of request body'),
    ('code', 'Drizzle schema for pgvector columns'),
    ('code', 'Playwright test for route health'),
    ('code', 'MCP tool registration for agents'),
    ('code', 'RabbitMQ queue consumer for document embedding'),
    ('code', 'SeaweedFS S3 upload of evidence files'),
    ('legal', 'California Civil Code provisions on landlord and tenant security deposits'),
    ('legal', 'statutes about evidence admissibility and hearsay'),
    ('legal', 'citation lookup for a statute section'),
    ('legal', 'case evidence chain of custody and hashing'),
    ('legal', 'legal document chunking by section'),
    ('legal', 'crawl of California legislative code pages'),
    ('legal', 'Family Code custody and support provisions'),
    ('legal', 'Penal Code definitions and sentencing'),
    ('legal', 'Vehicle Code traffic offenses'),
    ('legal', 'Business and Professions Code licensing rules'),
]
# The 'legal' queries were dropped: codebase_chunk_index holds code/docs, not statute text (probe returned glossary scripts), so they cannot be judged against this table.
QUERIES = [q for q in QUERIES if q[0] == 'code']
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / '.tmp' / 'atlas' / 'kmeans-raw768'
V = np.load(D / 'V0.npy')
ids = json.loads((D / 'ids0.json').read_text())
X = V / np.linalg.norm(V, axis=1, keepdims=True)
url = os.environ.get('DATABASE_URL')
if not url:
    for line in (ROOT / '.env').read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'\s*DATABASE_URL\s*=\s*(.+)', line)
        if m:
            url = m.group(1).strip().strip('"').strip("'")


def embed(texts):
    cache = D / 'query-embeddings.json'
    if cache.exists():  # WSL cannot reach the Windows-bound Ollama; embeddings are produced Windows-side from the same QUERIES list
        c = json.loads(cache.read_text())
        by_text = dict(zip(c['queries'], c['embeddings']))
        if all(t in by_text for t in texts):
            return np.array([by_text[t] for t in texts], dtype=np.float32)
    r =urllib.request.Request('http://127.0.0.1:11434/api/embed',
                               data=json.dumps({'model': 'embeddinggemma:latest', 'input': texts}).encode(),
                               headers={'Content-Type': 'application/json'})
    return np.array(json.load(urllib.request.urlopen(r, timeout=120))['embeddings'], dtype=np.float32)


Q = embed([q for _, q in QUERIES])
Q /= np.linalg.norm(Q, axis=1, keepdims=True)
rng = random.Random(23)
items = []
with psycopg.connect(url, options='-c default_transaction_read_only=on') as conn, conn.cursor() as cur:
    cur.execute('show transaction_read_only')
    assert cur.fetchone()[0] == 'on'
    for qi, (kind, text) in enumerate(QUERIES):
        s = X @ Q[qi]
        top = np.argpartition(-s, 10)[:10]
        top = top[np.argsort(-s[top])]
        pool = {ids[i]: ['dense_raw'] for i in top}
        cur.execute("select id::text from codebase_chunk_index where search_vector @@ plainto_tsquery('english', %s) "
                    "order by ts_rank(search_vector, plainto_tsquery('english', %s)) desc limit 5", (text, text))
        for (cid,) in cur.fetchall():
            pool.setdefault(cid, []).append('fts')
        cur.execute("select id::text, coalesce(relative_path, source_ref, ''), "
                    "left(regexp_replace(content, '\\s+', ' ', 'g'), 320) from codebase_chunk_index where id::text = any(%s)", (list(pool),))
        meta = {r[0]: r for r in cur.fetchall()}
        cands = [{'chunkId': c, 'path': meta[c][1], 'snippet': meta[c][2], 'lanes': pool[c]} for c in pool if c in meta]
        rng.shuffle(cands)
        items.append({'queryId': f'GQ{qi + 1:03d}', 'kind': kind, 'query': text, 'candidates': cands})
out = ROOT / 'docs' / 'reports'
with open(out / 'golden-query-candidates-v1.jsonl', 'w', encoding='utf-8') as f:
    for it in items:
        f.write(json.dumps(it, ensure_ascii=False) + '\n')
rows = []
for it in items:
    rows.append(f'<h3>{it["queryId"]} <small>[{it["kind"]}]</small> {html.escape(it["query"])}</h3>')
    for c in it['candidates']:
        k = f'{it["queryId"]}|{c["chunkId"]}'
        radios = ''.join(f'<label><input type=radio name="{k}" value={v}> {l}</label> '
                         for v, l in ((2, 'relevant'), (1, 'partly'), (0, 'not relevant')))
        rows.append(f'<div class=c data-k="{k}"><b>{html.escape(c["path"])}</b><br><code>{html.escape(c["snippet"])}</code><br>{radios}</div>')
script = """<script>const S="gq-v1";let st={};try{st=JSON.parse(localStorage.getItem(S)||"{}")}catch(e){}
document.querySelectorAll(".c").forEach(d=>{const k=d.dataset.k;if(st[k]!==undefined){const r=d.querySelector(`input[value="${st[k]}"]`);if(r)r.checked=true}
d.addEventListener("change",e=>{st[k]=e.target.value;try{localStorage.setItem(S,JSON.stringify(st))}catch(_){}})});
document.getElementById("x").onclick=()=>{const l=Object.entries(st).map(([k,v])=>{const[q,c]=k.split("|");return JSON.stringify({queryId:q,chunkId:c,label:Number(v)})}).join("\\n");
const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([l],{type:"application/x-ndjson"}));a.download="golden-query-labels-v1.jsonl";a.click()}</script>"""
page = ('<!doctype html><meta charset=utf-8><title>Golden query labels</title>'
        '<style>body{font:14px system-ui;max-width:980px;margin:1rem auto}.c{border:1px solid #ccc;padding:6px;margin:6px 0}code{color:#444}</style>'
        '<h1>SEARCH-GOLDEN-01 relevance labels</h1><p>Judge each chunk against the query. 2 relevant, 1 partly, 0 not relevant. Autosaves; Export downloads JSONL.</p>'
        '<button id=x>Export JSONL</button>' + ''.join(rows) + script)
(out / 'golden-query-review-sheet-v1.html').write_text(page, encoding='utf-8')
n = sum(len(i['candidates']) for i in items)
rec = {'schema': 'atlas.golden-query-candidates.v1', 'generatedAt': time.strftime('%Y-%m-%d'), 'readOnly': True, 'queries': len(items), 'candidates': n, 'goldLabels': 0,
       'jsonl': 'docs/reports/golden-query-candidates-v1.jsonl', 'sheet': 'docs/reports/golden-query-review-sheet-v1.html',
       'recipe': 'raw query embedding vs RAW content_embedding_768',
       'caveats': ['queries hand-written by the assistant, review/replace them', 'pooling favours the embedding under test; FTS lane reduces but does not remove bias',
                   'no gold labels until a human labels', 'chunks outside the raw-cache snapshot are not pooled']}
rec['checksum'] = 'sha256:' + hashlib.sha256(json.dumps(rec, sort_keys=True).encode()).hexdigest()
(out / 'golden-query-candidates-v1-receipt.json').write_text(json.dumps(rec, indent=1), encoding='utf-8')
print(json.dumps(rec))
