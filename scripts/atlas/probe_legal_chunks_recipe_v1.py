import json, math, subprocess, urllib.request
sql = "select c.id::text, coalesce(n.citation_label,''), c.chunk_text, c.embedding::text from legal_chunks c left join legal_nodes n on n.id=c.legal_node_id where c.embedding is not null order by md5(c.id::text) limit 20"
out = subprocess.run(['docker','exec','legal-ai-postgres','psql','-U','legal_admin','-d','legal_ai_db','-At','-F','\x1f','-c',sql],capture_output=True,text=True,encoding='utf-8').stdout
# chunk_text may contain newlines; rows start with a uuid
import re
rows=[]; cur=None
for line in out.split('\n'):
    if re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-', line) and line.count('\x1f')>=1:
        if cur: rows.append(cur)
        cur=line
    elif cur is not None: cur+='\n'+line
if cur: rows.append(cur)
data=[]
for r in rows:
    p=r.rsplit('\x1f',1); head=p[0].split('\x1f',2)
    data.append((head[0],head[1],head[2],json.loads(p[1].strip())))
def emb(ts):
    r=urllib.request.Request('http://127.0.0.1:11434/api/embed',data=json.dumps({'model':'embeddinggemma:latest','input':ts}).encode(),headers={'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(r,timeout=300))['embeddings']
def cos(a,b):
    d=sum(x*y for x,y in zip(a,b)); return d/math.sqrt(sum(x*x for x in a)*sum(y*y for y in b))
recipes={
 'raw': lambda c,t: t,
 'raw_trim': lambda c,t: t.strip(),
 'title_citation': lambda c,t: f'title: {c} | text: {t.strip()}',
 'title_none': lambda c,t: f'title: none | text: {t.strip()}',
 'search_document': lambda c,t: f'search_document: {t.strip()}',
}
res={}
for name,fn in recipes.items():
    e=emb([fn(c,t) for _,c,t,_ in data])
    cs=[cos(e[i],data[i][3]) for i in range(len(data))]
    res[name]={'mean':round(sum(cs)/len(cs),4),'min':round(min(cs),4),'ge0.99':sum(x>=0.99 for x in cs)}
print(len(data),json.dumps(res,indent=1))
