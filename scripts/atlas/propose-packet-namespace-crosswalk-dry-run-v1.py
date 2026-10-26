#!/usr/bin/env python3
"""
propose-packet-namespace-crosswalk-dry-run-v1.py  (NEXT-03 / PACKET-NAMESPACE-AUDIT-01, READ-ONLY, prints + scratch receipt only)

For each file present in atlas_packets under BOTH `sveltekit-frontend/<p>` and `<p>`, decide whether the two packets
describe the SAME file (a frontend-relative alias) or two DIFFERENT files that happen to share a suffix
(e.g. repo-root AGENTS.md vs sveltekit-frontend/AGENTS.md). The decision uses the disk, never canonical_source_ref
(lowercased and prefix-stripped, so it collapses distinct files):

  EQUIVALENT_FRONTEND_ROOT  repo-root `<p>` does NOT exist and `sveltekit-frontend/<p>` does  -> alias candidate
  DISTINCT_FILES            both `<p>` (repo root) and `sveltekit-frontend/<p>` exist           -> NOT an alias (two real files)
  FILE_MISSING              neither exists on disk                                              -> unlinked (stale packet)
  ONLY_REPO_ROOT            `<p>` exists, `sveltekit-frontend/<p>` does not                     -> unlinked (prefixed packet is stale)

It writes NOTHING to PostgreSQL. Usage: python scripts/atlas/propose-packet-namespace-crosswalk-dry-run-v1.py
Output: .tmp/atlas/packet-namespace-crosswalk-dry-run-v1.json
"""
import json, os, subprocess, collections, hashlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SQL = """
select a.packet_key||'|'||b.packet_key||'|'||a.source_ref||'|'||b.source_ref
from atlas_packets a join atlas_packets b on a.source_ref = 'sveltekit-frontend/' || b.source_ref
order by a.source_ref
"""
out = subprocess.run(['docker', 'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-c', SQL],
                     capture_output=True, text=True, check=True).stdout.splitlines()

def exists_exact(rel):
    """Case-sensitive existence (Windows is case-insensitive, so compare the real directory entry)."""
    cur = ROOT
    for part in rel.split('/'):
        try:
            names = os.listdir(cur)
        except OSError:
            return False
        if part not in names:
            return False
        cur = os.path.join(cur, part)
    return os.path.isfile(cur)

rows = []
for line in out:
    prefixed_key, plain_key, prefixed_ref, plain_ref = line.split('|')
    root_exists = exists_exact(plain_ref)
    front_exists = exists_exact(prefixed_ref)
    if front_exists and not root_exists:
        cls = 'EQUIVALENT_FRONTEND_ROOT'
    elif front_exists and root_exists:
        cls = 'DISTINCT_FILES'
    elif root_exists:
        cls = 'ONLY_REPO_ROOT'
    else:
        cls = 'FILE_MISSING'
    rows.append(dict(cls=cls, prefixed_key=prefixed_key, plain_key=plain_key, prefixed_ref=prefixed_ref, plain_ref=plain_ref,
                     scheme=f"{'ace:packet:' if plain_key.startswith('ace:packet:') else 'packet:'}"))

counts = collections.Counter(r['cls'] for r in rows)
by_scheme = collections.Counter((r['cls'], r['scheme']) for r in rows)
cand = [r for r in rows if r['cls'] == 'EQUIVALENT_FRONTEND_ROOT']
top_dirs = collections.Counter(r['plain_ref'].split('/')[0] for r in cand)
distinct_examples = [r['plain_ref'] for r in rows if r['cls'] == 'DISTINCT_FILES'][:5]
receipt = dict(
    schema='atlas.packet-namespace-crosswalk-dry-run.v1', mode='DRY_RUN', writesPerformed=False, canonicalAuthority=False,
    pairsExamined=len(rows), classification=dict(counts),
    byClassAndPlainKeyScheme={f'{k[0]}|{k[1]}': v for k, v in sorted(by_scheme.items())},
    aliasCandidates=len(cand), candidateTopLevelDirs=dict(top_dirs.most_common(8)),
    distinctFileExamples=distinct_examples,
    proposedAlias=dict(kind='PATH_NAMESPACE_DIVERGENCE', direction='alias_key=plain `<p>` packet -> canonical_packet_key=`sveltekit-frontend/<p>` packet',
                       rationale='repo-root path is the file identity; frontend-relative refs are an older view of the same file'),
    candidates=cand,
    candidatesChecksum=hashlib.sha256(json.dumps([(r['plain_key'], r['prefixed_key']) for r in cand], sort_keys=True).encode()).hexdigest(),
)
os.makedirs(os.path.join(ROOT, '.tmp', 'atlas'), exist_ok=True)
with open(os.path.join(ROOT, '.tmp', 'atlas', 'packet-namespace-crosswalk-dry-run-v1.json'), 'w') as f:
    json.dump(receipt, f, indent=1)
print(json.dumps({k: receipt[k] for k in ('pairsExamined', 'classification', 'byClassAndPlainKeyScheme', 'aliasCandidates', 'candidateTopLevelDirs', 'distinctFileExamples', 'candidatesChecksum')}, indent=1))
print('RECEIPT .tmp/atlas/packet-namespace-crosswalk-dry-run-v1.json')
