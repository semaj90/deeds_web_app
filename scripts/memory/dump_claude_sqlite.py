import json, sqlite3, sys
p = sys.argv[1]
limit = int(sys.argv[2]) if len(sys.argv)>2 else 200
out = []
conn = sqlite3.connect(p)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
tables = [row[0] for row in cur.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")]
preferred = {'observations','observation','memories','memory','messages','notes','sessions','session_observations','tool_calls'}
for table in tables:
    cols = [r[1] for r in cur.execute(f"PRAGMA table_info('{table}')")]
    if not cols:
        continue
    name_hit = table.lower() in preferred or any(col in cols for col in ('summary','content','message','observation','note','text'))
    if not name_hit:
        continue
    try:
        rows = cur.execute(f'SELECT * FROM "{table}" LIMIT ?', (limit,)).fetchall()
    except Exception:
        continue
    for row in rows:
        rec = dict(row)
        rec['_source_table'] = table
        out.append(rec)
with open('.tmp/claude-mem-export.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False)
print('wrote .tmp/claude-mem-export.json', len(out))
