#!/usr/bin/env python3
"""Fail-closed offline checks for the Morrow Bay demo fixture only."""
import hashlib, json, re, struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
FIX=ROOT/'sveltekit-frontend'/'src'/'lib'/'server'/'reconstruction'/'fixtures'/'state-v-unidentified-participants-e2e-01b.json'
ASSET=ROOT/'sveltekit-frontend'/'static'/'demos'/'morrow-bay-case-scene-e2e-01b'/'assets'/'neutral-contour-placeholder.glb'
HEX=re.compile(r'^[0-9a-f]{64}$')

def validate(fixture,asset_bytes):
    problems=[]
    def req(test,msg):
        if not test: problems.append(msg)
    case=fixture.get('case') or {}
    req(case.get('admission')=='DEMO_ONLY','fixture admission must be DEMO_ONLY')
    req(case.get('provenance')=='SYNTHETIC_FIXTURE','fixture provenance missing')
    req(case.get('real_case') is False,'fixture cannot assert a real case')
    people=fixture.get('person_registry') or []
    pids=[p['registry_key'] for p in people]
    req(len(set(pids))==len(pids),'duplicate person registry keys')
    pset=set(pids)
    evidence=fixture.get('evidence_items') or []
    evids=[e['evidence_id'] for e in evidence]
    req(len(set(evids))==len(evids),'duplicate evidence keys')
    eset=set(evids)
    clocks=fixture.get('clock_registry') or []
    clock_ids=[c['clock_id'] for c in clocks]
    req(len(clock_ids)==len(set(clock_ids)),'duplicate source clock IDs')
    req('CLK-BANK-CAM' in clock_ids and 'CLK-BANK-SYS' in clock_ids and 'CLK-BANK-CAM' != 'CLK-BANK-SYS',
        'bank camera and bank system clocks must remain distinct')
    clock_set=set(clock_ids)
    for e in evidence:
        req(e.get('materialized') is False and e.get('sha256') is None and e.get('storage_key') is None,
            f'{e["evidence_id"]}: demo metadata must not impersonate uploaded bytes')
        req(e.get('clock_id') is None or e['clock_id'] in clock_set,
            f'{e["evidence_id"]}: unknown source clock')
    assets=fixture.get('assets') or []
    req(len(assets)==1,'expected one synthetic placeholder GLB')
    known_assets=set()
    for a in assets:
        known_assets.add(a['asset_uuid'])
        h=a.get('sha256','')
        req(bool(HEX.fullmatch(h)),f'{a["asset_uuid"]}: malformed hash')
        req(hashlib.sha256(asset_bytes).hexdigest()==h,f'{a["asset_uuid"]}: hash mismatch')
        req(len(asset_bytes)==a.get('byte_length'),f'{a["asset_uuid"]}: length mismatch')
        req(a.get('asset_id_scope')=='DEMO_FIXTURE_LOCAL_NOT_DATABASE_ID','fixture asset ID cannot impersonate a PostgreSQL UUID')
        req(a.get('is_illustrative') is True and a.get('is_evidence') is False,'cannot label placeholder as source evidence')
        req(a.get('path') == 'assets/neutral-contour-placeholder.glb','unexpected fixture asset key')
    req(len(asset_bytes)>=20 and asset_bytes[:4]==b'glTF' and struct.unpack_from('<I',asset_bytes,8)[0]==len(asset_bytes), 'invalid GLB container')
    scenes=fixture.get('scenes') or []
    req(len(scenes)==5,'expected five scenes')
    req({s['scene_id'] for s in scenes}=={'SCENE-A','SCENE-B','SCENE-C','SCENE-D','SCENE-E'},'invalid scene IDs')
    event_ids=[]
    evidence_by_id={e['evidence_id']:e for e in evidence}
    for s in scenes:
        coord=s['coordinate_frame']
        req(coord.get('origin')==[0,0,0] and coord.get('is_real_world_gps') is False,f'{s["scene_id"]}: unsafe coordinate frame')
        req(s.get('persistence_status')=='fixture_read_only',f'{s["scene_id"]}: write admission invalid')
        for a in s['actors']:
            req(a['registry_key'] in pset,f'{s["scene_id"]}: unknown person {a["registry_key"]}')
            req(a['mesh_asset_ref'] in known_assets,f'{s["scene_id"]}: unknown mesh asset')
            req(a.get('identity_established') is False,f'{s["scene_id"]}: automatic identity claim')
            q=a['transform']['quaternion']
            req(len(q)==4 and abs(sum(v*v for v in q)-1)<1e-6,'quaternion not normalized')
        for t in s['timeline_proposals']:
            event_ids.append(t['event_id'])
            req(t['clock_id'] in clock_set,f'{t["event_id"]}: unknown source clock')
            req(t.get('aligned_time') is None and t.get('status')=='provisional',f'{t["event_id"]}: unreviewed clock applied')
            for r in t['evidence_refs']:
                req(r in eset,f'{t["event_id"]}: unknown evidence {r}')
                source_clock=evidence_by_id.get(r,{}).get('clock_id')
                req(source_clock is None or source_clock==t['clock_id'],
                    f'{t["event_id"]}: cannot combine evidence across source clocks')
    req(len(event_ids)==len(set(event_ids)),'duplicate event IDs')
    for link in fixture.get('reviewed_links',[]):
        req(link['subject_a'] in pset and link['subject_b'] in pset,'invalid identity-link registry keys')
        req(link['review_status']!='accepted','review link must not be preaccepted')
        for ev in link['supporting_evidence']: req(ev in eset,f'invalid link evidence {ev}')
    for tr in fixture.get('transcripts',[]):
        req(tr['derived_from'] in eset,'transcript refers to missing recording')
        req(tr['source_clock_id'] in clock_set,'unknown transcript clock')
        req(tr.get('is_synthetic') is True,'transcript not explicitly fictional')
        for span in tr['spans']:
            req(span.get('time_basis')=='media_relative_ms' and 0 <= span['start_ms'] < span['end_ms'],
                'transcript must use valid media-relative timestamps')
            req(span['speaker_label'] in pset,'unknown synthetic speaker')
    for off in fixture.get('clock_offsets',[]):
        req(off['clock_id'] in clock_set and off['reference_clock_id'] in clock_set,'unknown calibration clock')
        req(off['review_status']=='provisional_unverified' and off.get('approved_for_use') is False,
            'unreviewed clock calibration used')
    qs=fixture.get('prosecutor_review_questions') or []
    req(len(qs)==6,'expected six review questions')
    for q in qs:
        req(q['status']=='unresolved','review question must remain unresolved')
        for r in q['refs']:req(r in eset,f'{q["id"]}: unknown evidence {r}')
    req(fixture.get('persistence',{}).get('writes_performed') is False,'write should not be claimed')
    return problems

if __name__=='__main__':
    errors=validate(json.loads(FIX.read_text()),ASSET.read_bytes())
    if errors:
        for e in errors: print('FAIL',e)
        raise SystemExit(1)
    print('PASS: hashes, GLB header, 5 scenes, 6 people, cross-references, clocks, transcripts and demo-only boundaries')
