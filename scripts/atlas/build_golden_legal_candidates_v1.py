#!/usr/bin/env python3
"""
SEARCH-GOLDEN-01 legal half: pooled candidate sheet for human relevance labelling over legal_chunks (California codes in the corpus: Health & Safety, Welfare & Institutions,
Penal, Civil, Evidence). Read-only DB, no model judging. Pool per query = exact cosine top-10 on legal_chunks.embedding (query embedded raw; the corpus embedding recipe is NOT
recorded, so this is an assumption) + Postgres FTS top-5 on legal_chunks.tsv. Shuffled, lanes hidden in the HTML. Gold labels come only from a human (2 / 1 / 0).
Query embeddings are read from .tmp/atlas/kmeans-raw768/legal-query-embeddings.json (WSL cannot reach the Windows-bound Ollama); the file is produced from QUERIES below.
Run: /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/build_golden_legal_candidates_v1.py
"""
import hashlib, html, json, os, random, re, time
from pathlib import Path
import numpy as np, psycopg

QUERIES = [
    'rules about a landlord returning a tenant security deposit',
    'what makes evidence inadmissible as hearsay',
    'definition of a firearm and rules for transferring one',
    'when may a court order involuntary treatment of a person with a mental disorder',
    'requirements for a valid written contract',
    'statute of limitations for filing a civil action',
    'rights of a person receiving public social services benefits',
    'penalties for possession of a controlled substance',
    'authentication of a writing as evidence',
    'duty of a licensed care facility to protect residents',
    'the definition of burglary',
    'liability for damage caused by negligence',
    'foster care placement of a child',
    'requirements to disclose defects when selling real property',
    'expert witness testimony qualifications',
    'regulation of hazardous waste disposal',
    'privilege for confidential communications between attorney and client',
    'conditions for granting probation',
    'unlawful detainer and eviction notice periods',
    'local agency financing for housing',
]
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / '.tmp' / 'atlas' / 'kmeans-raw768'
cache = json.loads((D / 'legal-query-embeddings.json').read_text())
by_text = dict(zip(cache['queries'], cache['embeddings']))
Q = np.array([by_text[t] for t in QUERIES], dtype=np.float32)
Q /= np.linalg.norm(Q, axis=1, keepdims=True)
url = os.environ.get('DATABASE_URL')
if not url:
    for line in (ROOT / '.env').read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'\s*DATABASE_URL\s*=\s*(.+)', line)
        if m:
            url = m.group(1).strip().strip('"').strip("'")
rng = random.Random(29)
items = []
with psycopg.connect(url, options='-c default_transaction_read_only=on') as conn, conn.cursor() as cur:
    cur.execute('show transaction_read_only')
    assert cur.fetchone()[0] == 'on'
    cur.execute('select count(*) from legal_chunks where embedding is not null')
    n = cur.fetchone()[0]
    ids, X = [], np.empty((n, 768), dtype=np.float32)
    with conn.cursor(name='legal_stream') as sc:
        sc.itersize = 2000
        sc.execute('select id::text, embedding::text from legal_chunks where embedding is not null order by id')
        for i, (cid, txt) in enumerate(sc):
            X[i] = np.fromstring(txt.strip('[]'), sep=',', dtype=np.float32)
            ids.append(cid)
    X = X[:len(ids)]
    X /= np.linalg.norm(X, axis=1, keepdims=True)
    for qi, text in enumerate(QUERIES):
        s = X @ Q[qi]
        top = np.argpartition(-s, 10)[:10]
        top = top[np.argsort(-s[top])]
        pool = {ids[i]: ['dense'] for i in top}
        cur.execute("select id::text from legal_chunks where tsv @@ plainto_tsquery('english', %s) "
                    "order by ts_rank(tsv, plainto_tsquery('english', %s)) desc limit 5", (text, text))
        for (cid,) in cur.fetchall():
            pool.setdefault(cid, []).append('fts')
        cur.execute("select c.id::text, coalesce(n.citation_label, ''), left(regexp_replace(c.chunk_text, '\\s+', ' ', 'g'), 360) "
                    "from legal_chunks c left join legal_nodes n on n.id = c.legal_node_id where c.id::text = any(%s)", (list(pool),))
        meta = {r[0]: r for r in cur.fetchall()}
        cands = [{'chunkId': c, 'path': meta[c][1], 'snippet': meta[c][2], 'lanes': pool[c]} for c in pool if c in meta]
        rng.shuffle(cands)
        items.append({'queryId': f'GL{qi + 1:03d}', 'kind': 'legal', 'query': text, 'candidates': cands})
out = ROOT / 'docs' / 'reports'
with open(out / 'golden-legal-candidates-v1.jsonl', 'w', encoding='utf-8') as f:
    for it in items:
        f.write(json.dumps(it, ensure_ascii=False) + '\n')
rows = []
for it in items:
    rows.append(f'<h3>{it["queryId"]} {html.escape(it["query"])}</h3>')
    for c in it['candidates']:
        k = f'{it["queryId"]}|{c["chunkId"]}'
        radios = ''.join(f'<label><input type=radio name="{k}" value={v}> {l}</label> '
                         for v, l in ((2, 'relevant'), (1, 'partly'), (0, 'not relevant')))
        rows.append(f'<div class=c data-k="{k}"><b>{html.escape(c["path"])}</b><br><code>{html.escape(c["snippet"])}</code><br>{radios}</div>')
script = """<script>const S="gl-v1";let st={};try{st=JSON.parse(localStorage.getItem(S)||"{}")}catch(e){}
document.querySelectorAll(".c").forEach(d=>{const k=d.dataset.k;if(st[k]!==undefined){const r=d.querySelector(`input[value="${st[k]}"]`);if(r)r.checked=true}
d.addEventListener("change",e=>{st[k]=e.target.value;try{localStorage.setItem(S,JSON.stringify(st))}catch(_){}})});
document.getElementById("x").onclick=()=>{const l=Object.entries(st).map(([k,v])=>{const[q,c]=k.split("|");return JSON.stringify({queryId:q,chunkId:c,label:Number(v)})}).join("\\n");
const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([l],{type:"application/x-ndjson"}));a.download="golden-legal-labels-v1.jsonl";a.click()}</script>"""
page = ('<!doctype html><meta charset=utf-8><title>Golden legal labels</title>'
        '<style>body{font:14px system-ui;max-width:980px;margin:1rem auto}.c{border:1px solid #ccc;padding:6px;margin:6px 0}code{color:#444}</style>'
        '<h1>SEARCH-GOLDEN-01 legal relevance labels</h1><p>Judge each statute chunk against the query. 2 relevant, 1 partly, 0 not relevant. Autosaves; Export downloads JSONL.</p>'
        '<button id=x>Export JSONL</button>' + ''.join(rows) + script)
(out / 'golden-legal-review-sheet-v1.html').write_text(page, encoding='utf-8')
nc = sum(len(i['candidates']) for i in items)
both = sum(1 for i in items for c in i['candidates'] if len(c['lanes']) > 1)
rec = {'schema': 'atlas.golden-legal-candidates.v1', 'generatedAt': time.strftime('%Y-%m-%d'), 'readOnly': True, 'queries': len(items), 'candidates': nc, 'foundByBothLanes': both,
       'corpusChunksEmbedded': len(ids), 'goldLabels': 0, 'sheet': 'docs/reports/golden-legal-review-sheet-v1.html', 'jsonl': 'docs/reports/golden-legal-candidates-v1.jsonl (gitignored)',
       'caveats': ['queries written by the assistant, review/replace them', 'legal_chunks embedding recipe/model is NOT recorded; raw query embedding is an assumption',
                   'corpus holds only Health & Safety, Welfare & Institutions, Penal, Civil and Evidence codes (no Family, Vehicle, B&P)',
                   'pooling favours the embedding under test', 'no gold labels until a human labels']}
rec['checksum'] = 'sha256:' + hashlib.sha256(json.dumps(rec, sort_keys=True).encode()).hexdigest()
(out / 'golden-legal-candidates-v1-receipt.json').write_text(json.dumps(rec, indent=1), encoding='utf-8')
print(json.dumps(rec)[:600])
