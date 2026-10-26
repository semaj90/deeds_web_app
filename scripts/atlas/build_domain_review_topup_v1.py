#!/usr/bin/env python3
"""
Top up the domain calibration draft so every top-level taxonomy group has >= TARGET candidate rows for human review.

Read-only (SELECT only). Writes two NEW local files and never edits the v1 draft:
  docs/reports/domain-calibration-draft-v2.jsonl   (v1 rows + top-up rows, same schema, all UNREVIEWED)
  docs/reports/domain-calibration-topup-v1-receipt.json
Candidates are mapped ONLY through the deterministic legacy->group rules from docs/reports/domain-crosswalk-proposal-v1.json
(EXACT, CASE_NORMALIZED, PROPOSED name-based). 'proposedOntologyGroup' is a PROPOSAL for a human to confirm or correct; it is not a label.
Rows are drawn by md5(packet_key) order, so the draw is deterministic. Run with the RAPIDS env python (has psycopg).
"""
import hashlib, json, os, re, sys, time
from pathlib import Path
import psycopg

TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 40
ROOT = Path(__file__).resolve().parents[2]
url = os.environ.get('DATABASE_URL')
if not url:
    for line in (ROOT / '.env').read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'\s*DATABASE_URL\s*=\s*(.+)', line)
        if m: url = m.group(1).strip().strip('"').strip("'")
cw = json.loads((ROOT / 'docs/reports/domain-crosswalk-proposal-v1.json').read_text(encoding='utf-8'))
top = ['api', 'auth', 'cache', 'compiler', 'database', 'devops', 'error-handling', 'frontend', 'gpu', 'graph', 'machine-learning', 'retrieval', 'test']
rule = {}  # legacy value -> (group, mappingKind)
for r in cw['rows']:
    if r['targetGroupId'] in top:
        rule[r['legacy']] = (r['targetGroupId'], {'EXACT': 'EXACT_IN_DOMAIN_ONTOLOGY', 'CASE_NORMALIZED': 'FOLD_ALIAS', 'PROPOSED_NEEDS_REVIEW': 'FOLD_ALIAS'}[r['status']])
v1 = [json.loads(l) for l in (ROOT / 'docs/reports/domain-calibration-draft-v1.jsonl').read_text(encoding='utf-8').splitlines() if l.strip()]
have = {g: sum(1 for r in v1 if r['proposedOntologyGroup'] == g) for g in top}
seen = {r['packetKey'] for r in v1}
added, short = [], {}
with psycopg.connect(url) as conn, conn.cursor() as cur:
    for g in top:
        need = max(0, TARGET - have[g])
        legacy = [k for k, (grp, _) in rule.items() if grp == g]
        if not need or not legacy: short[g] = need if not legacy else 0; continue
        cur.execute("""select packet_key, source_ref, coalesce(feature_label,''), left(coalesce(summary,''), 400), domain_class, source_revision
                       from atlas_packets where domain_class = any(%s) and packet_key is not null and source_ref is not null
                       order by md5(packet_key) limit %s""", (legacy, need + len(seen) // 4 + 20))
        got = 0
        for pk, sref, label, summ, dc, srev in cur.fetchall():
            if pk in seen or got >= need: continue
            seen.add(pk); got += 1
            grp, kind = rule[dc]
            added.append({'schema': 'atlas.domain-calibration-example.draft.v1', 'packetKey': pk, 'sourceRef': sref, 'sourceRevision': srev if srev else None, 'featureLabel': label,
                          'textEvidence': summ, 'originalLabel': dc, 'proposedOntologyGroup': grp, 'mappingKind': kind, 'reviewStatus': 'UNREVIEWED', 'reviewedGroup': None,
                          'reviewer': None, 'reviewedAt': None, 'note': 'top-up v2: proposed from EXISTING weak label via the crosswalk proposal; a human must confirm or correct. textEvidence is a stored summary, not truth; judge from the path/file.',
                          'revisionResolution': 'BINDING_EXACT' if srev else 'UNRESOLVED'})
        short[g] = max(0, need - got)
out = ROOT / 'docs/reports/domain-calibration-draft-v2.jsonl'
out.write_text('\n'.join(json.dumps(r, ensure_ascii=False) for r in v1 + added) + '\n', encoding='utf-8')
per = {g: sum(1 for r in v1 + added if r['proposedOntologyGroup'] == g) for g in top}
receipt = {'schema': 'atlas.domain-calibration-topup.v1', 'generatedAt': time.strftime('%Y-%m-%d'), 'readOnly': True, 'writesPerformed': False, 'target': TARGET, 'v1Rows': len(v1), 'addedRows': len(added),
           'totalRows': len(v1) + len(added), 'perGroupProposed': per, 'stillShort': short, 'allUnreviewed': True,
           'trustFloor': {'reviewedRowsRequired': 200, 'perClassRequired': 30, 'note': 'counts are CANDIDATES, not reviewed rows; some will be marked AMBIGUOUS / NOT_A_DOMAIN / SKIP'},
           'sourceChecksums': {'draftV1': 'sha256:' + hashlib.sha256((ROOT / 'docs/reports/domain-calibration-draft-v1.jsonl').read_bytes()).hexdigest(), 'crosswalk': cw.get('checksum')},
           'outputChecksum': 'sha256:' + hashlib.sha256(out.read_bytes()).hexdigest()}
(ROOT / 'docs/reports/domain-calibration-topup-v1-receipt.json').write_text(json.dumps(receipt, indent=1), encoding='utf-8')
print(json.dumps({k: receipt[k] for k in ('v1Rows', 'addedRows', 'totalRows', 'perGroupProposed', 'stillShort')}, indent=1))
