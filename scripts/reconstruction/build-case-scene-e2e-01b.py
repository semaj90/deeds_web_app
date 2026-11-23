#!/usr/bin/env python3
"""Standard-library-only deterministic synthetic silhouette GLB and case fixture generator.
No production database / object storage writes. Not a forensic reconstruction.
"""
from __future__ import annotations
import hashlib, json, math, struct
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
GLB = ROOT / 'sveltekit-frontend' / 'static' / 'demos' / 'morrow-bay-case-scene-e2e-01b' / 'assets' / 'neutral-contour-placeholder.glb'
FIXTURE = ROOT / 'sveltekit-frontend' / 'src' / 'lib' / 'server' / 'reconstruction' / 'fixtures' / 'state-v-unidentified-participants-e2e-01b.json'
ASSET_UUID = '00000000-0000-4000-8000-000000000101'
CASE_ID = 'CASE-MB-2026-001'
# A purely hand-authored, fictional silhouette in local meters. Not extracted from a source mask.
OUTLINE = [(-.32,0),(-.32,.12),(-.22,.12),(-.22,.77),(-.28,.81),(-.43,.79),(-.48,1.30),(-.32,1.32),(-.26,1.48),(-.13,1.51),(-.13,1.62),(-.19,1.66),(-.19,1.88),(-.11,1.99),(.11,1.99),(.19,1.88),(.19,1.66),(.13,1.62),(.13,1.51),(.26,1.48),(.32,1.32),(.48,1.30),(.43,.79),(.28,.81),(.22,.77),(.22,.12),(.32,.12),(.32,0),(.07,0),(.07,.80),(-.07,.80),(-.07,0)]

def signed_area(points):
    return sum(x*y1-x1*y for (x,y),(x1,y1) in zip(points,points[1:]+points[:1])) / 2

def triangle_area(a,b,c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])

def point_in_triangle(p,a,b,c,eps=1e-12):
    return all(triangle_area(u,v,p) >= -eps for u,v in ((a,b),(b,c),(c,a)))

def ears(points):
    """Ear clipping for a simple non-self-intersecting CCW outline with no holes."""
    if signed_area(points) <= 0: raise ValueError('outline must be CCW')
    rem=list(range(len(points))); out=[]
    while len(rem) > 3:
        found=False
        for k in range(len(rem)):
            a,b,c=rem[k-1],rem[k],rem[(k+1)%len(rem)]
            if triangle_area(points[a], points[b], points[c]) < 1e-10: continue
            if any(point_in_triangle(points[q],points[a],points[b],points[c]) for q in rem if q not in (a,b,c)):
                continue
            out.extend([a,b,c]); rem.pop(k); found=True; break
        if not found: raise ValueError('degenerate or self-intersecting outline')
    out.extend(rem)
    return out

def make_glb(points, thickness=.12):
    points=list(points)
    if signed_area(points)<0: points.reverse()
    tris=ears(points)
    half=thickness/2
    verts=[]; normals=[]; idx=[]
    def v(p,n):
        verts.append(p); normals.append(n); return len(verts)-1
    front=[v((x,y,half),(0,0,1)) for x,y in points]
    back=[v((x,y,-half),(0,0,-1)) for x,y in points]
    for i in range(0,len(tris),3):
        a,b,c=tris[i:i+3]
        idx.extend((front[a],front[b],front[c], back[c],back[b],back[a]))
    for (x,y),(x1,y1) in zip(points,points[1:]+points[:1]):
        dx,dy=x1-x,y1-y; leng=math.hypot(dx,dy)
        if leng < 1e-9: raise ValueError('zero-length contour edge')
        n=(dy/leng,-dx/leng,0)
        a=v((x,y,-half),n); b=v((x1,y1,-half),n)
        c=v((x1,y1,half),n); d=v((x,y,half),n)
        idx.extend((a,b,c,a,c,d))
    if len(verts)>65535: raise ValueError('uint16 vertex limit')
    pos=struct.pack('<'+'f'*len(verts)*3, *(t for p in verts for t in p))
    nor=struct.pack('<'+'f'*len(normals)*3, *(t for p in normals for t in p))
    indices=struct.pack('<'+'H'*len(idx),*idx)
    blob=pos+nor+indices
    def pad4(b, pad=b'\x00'): return b + pad * ((-len(b))%4)
    blob=pad4(blob)
    mn=[min(p[i] for p in verts) for i in range(3)]
    mx=[max(p[i] for p in verts) for i in range(3)]
    doc={
      'asset':{'version':'2.0','generator':'parent-atlas-synthetic-contour-v1'},
      'buffers':[{'byteLength':len(blob)}],
      'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(pos),'target':34962},
                     {'buffer':0,'byteOffset':len(pos),'byteLength':len(nor),'target':34962},
                     {'buffer':0,'byteOffset':len(pos)+len(nor),'byteLength':len(indices),'target':34963}],
      'accessors':[{'bufferView':0,'componentType':5126,'count':len(verts),'type':'VEC3','min':mn,'max':mx},
                   {'bufferView':1,'componentType':5126,'count':len(verts),'type':'VEC3'},
                   {'bufferView':2,'componentType':5123,'count':len(idx),'type':'SCALAR','min':[0],'max':[len(verts)-1]}],
      'materials':[{'name':'synthetic-placeholder','doubleSided':False,'pbrMetallicRoughness':{'baseColorFactor':[.58,.61,.62,1],'metallicFactor':0,'roughnessFactor':1}}],
      'meshes':[{'name':'neutral-person-silhouette-extruded','primitives':[{'attributes':{'POSITION':0,'NORMAL':1},'indices':2,'material':0,'mode':4}], 'extras':{'provenance':'SYNTHETIC_FIXTURE','isIllustrative':True,'source':'hand-authored-contour'}}],
      'nodes':[{'mesh':0,'name':'synthetic-placeholder-actor'}],
      'scenes':[{'nodes':[0]}],'scene':0
    }
    j=pad4(json.dumps(doc,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode(),b' ')
    total=12+8+len(j)+8+len(blob)
    return (struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(j),b'JSON')+j+
            struct.pack('<I4s',len(blob),b'BIN\x00')+blob)

def person(registry_key,label,status):
    return {'registry_key':registry_key,'provisional_label':label,'status':status,
            'default_representation':'neutral_lowpoly_generic','identity_established':False}

def actor(scene,personid,position,rot=0):
    return {'actor_id':f'ACT-{scene}-{personid}', 'registry_key':personid,
        'label_policy':'display_provisional_tag',
        'transform':{'position':position,'quaternion':[0,round(math.sin(math.radians(rot/2)),8),0,round(math.cos(math.radians(rot/2)),8)],'scale':[1,1,1]},
        'mesh_asset_ref':ASSET_UUID,'portrait_artifact':None,'is_illustrative':True,
        'identity_established':False}

def scene(scene_id,title,grid_id,actors,events):
    return {'scene_id':scene_id,'title':title,
      'coordinate_frame':{'grid_id':grid_id,'origin':[0,0,0],'up_axis':'+Y','forward_axis':'-Z',
                          'unit':'meter','is_real_world_gps':False,'calibration_status':'not_calibrated'},
      'timeline_proposals':events,'actors':actors,'render_mode':'illustrative_blockout',
      'scene_revision':0,'persistence_status':'fixture_read_only'}

def event(eid,source_clock,timestamp,description,evidence):
    return {'event_id':eid,'source_timestamp':timestamp,'clock_id':source_clock,
            'proposal':description,'evidence_refs':evidence,'status':'provisional',
            'aligned_time':None,'review_revision':None}

def create_fixture(asset_hash,asset_size):
    e=[
      {'evidence_id':'CAM-ENTRY-01','type':'video','clock_id':'CLK-BANK-CAM'},
      {'evidence_id':'CAM-LOBBY-01','type':'video','clock_id':'CLK-BANK-CAM'},
      {'evidence_id':'CAM-REAR-02','type':'video','clock_id':'CLK-BANK-CAM'},
      {'evidence_id':'CAM-TRANSIT-07','type':'video','clock_id':'CLK-TRANSIT-07'},
      {'evidence_id':'AL-01','type':'alarm_log','clock_id':'CLK-BANK-SYS'},
      {'evidence_id':'W-02','type':'witness_statement','clock_id':None},
      {'evidence_id':'INT-DET-01','type':'audio','clock_id':'CLK-INTERVIEW-ROOM-2'},
      {'evidence_id':'INT-DET-02','type':'audio','clock_id':'CLK-INTERVIEW-ROOM-2'}]
    for x in e:
        x.update({'materialized':False,'sha256':None,'storage_key':None,
                  'fixture_note':'Synthetic metadata stub only; no media or source bytes exist'})
    scenes=[
      scene('SCENE-A','Exterior approach','MB-EXTERIOR',
         [actor('A','POI-01',[0.8,0,-4.5]),actor('A','POI-02',[-1.1,0,-5])],
         [event('EVT-A-01','CLK-BANK-CAM','10:13:58','Two generic silhouettes approach a fictional entrance; roles unverified',['CAM-ENTRY-01'])]),
      scene('SCENE-B','Lobby and teller area','MB-LOBBY',
         [actor('B','POI-01',[1.4,0,-3.2],15),actor('B','POI-02',[-0.5,0,-2.9]),actor('B','POI-03',[0.2,0,-1.7]),actor('B','POI-04',[-1.3,0,-3.9])],
         [event('EVT-B-01','CLK-BANK-CAM','10:14:09','Group of generic actors appears in lobby; association provisional',['CAM-LOBBY-01']),
          event('EVT-B-02','CLK-BANK-CAM','10:14:31','Actor matching POI-01 description approaches window 2; disputed',['CAM-LOBBY-01','W-02'])]),
      scene('SCENE-C','Rear service corridor','MB-REAR',
         [actor('C','POI-03',[1.2,0,-2.8]),actor('C','POI-04',[-0.7,0,-1.4])],
         [event('EVT-C-01','CLK-BANK-SYS','10:15:42','Fictional bank alarm system records activation; relation to separate camera-clock events remains unaligned',['AL-01'])]),
      scene('SCENE-D','Underpass and detentions','MB-UNDERPASS',
         [actor('D','DET-01',[-0.4,0,-3.0]),actor('D','DET-02',[1.1,0,-3.4])],
         [event('EVT-D-01','CLK-TRANSIT-07','10:17:06','Two detained-person placeholders appear in a distinct clock domain',['CAM-TRANSIT-07'])]),
      scene('SCENE-E','Interview and prosecutor review','MB-INTERVIEW',
         [actor('E','DET-01',[-0.7,0,-1.5]),actor('E','DET-02',[.7,0,-1.5])],
         [event('EVT-E-01','CLK-INTERVIEW-ROOM-2','11:08:14','Recorded account is represented by a synthetic transcript only',['INT-DET-01']),
          event('EVT-E-02','CLK-INTERVIEW-ROOM-2','11:28:20','Second account; no inference of culpability',['INT-DET-02'])])]
    return {
      'schema':'parent-atlas.case-scene-demo/v1','schema_version':1,
      'case':{'case_id':CASE_ID,'title':'State v. Unidentified Participants','jurisdiction':'Morrow Bay (Fictional)',
              'provenance':'SYNTHETIC_FIXTURE','admission':'DEMO_ONLY','epistemic_status':'investigative_hypothesis',
              'real_case':False},
      'person_registry':[
        person('POI-01','Person at teller counter','unidentified_role_disputed'),
        person('POI-02','Person near entrance','unidentified_role_disputed'),
        person('POI-03','Person near rear corridor','unidentified_role_disputed'),
        person('POI-04','Fourth person in lobby','unidentified_role_disputed'),
        person('DET-01','Underpass Detainee 1','recorded_detention_unlinked'),
        person('DET-02','Underpass Detainee 2','recorded_detention_unlinked')],
      'reviewed_links':[{'link_id':'LINK-001','type':'identity_equivalence','subject_a':'DET-01','subject_b':'POI-01',
         'review_status':'unreviewed_open_question','supporting_evidence':['CAM-LOBBY-01','CAM-TRANSIT-07','INT-DET-01'],
         'notes':'Unverified comparison question; no automatic person merge.'}],
      'evidence_items':e,
      'transcripts':[{'transcript_id':'TR-DET-01','derived_from':'INT-DET-01','source_clock_id':'CLK-INTERVIEW-ROOM-2',
           'is_synthetic':True,'spans':[{'span_id':'TR-DET-01-S04','speaker_label':'DET-01',
              'start_ms':14000,'end_ms':29000,
              'media_start_source_time':'11:08:00','time_basis':'media_relative_ms',
              'text':'I walked straight through the underpass from the ferry terminal, never went near the credit union.',
              'epistemic_tag':'interviewee_claim'}]},
         {'transcript_id':'TR-DET-02','derived_from':'INT-DET-02','source_clock_id':'CLK-INTERVIEW-ROOM-2',
           'is_synthetic':True,'spans':[{'span_id':'TR-DET-02-S01','speaker_label':'DET-02',
              'start_ms':20000,'end_ms':31000,
              'media_start_source_time':'11:28:00','time_basis':'media_relative_ms',
              'text':'I was walking toward the station; I do not know those people.',
              'epistemic_tag':'interviewee_claim'}]}],
      'clock_offsets':[{'clock_id':'CLK-TRANSIT-07','reference_clock_id':'CLK-BANK-CAM',
           'estimated_offset_seconds':-90,'uncertainty_seconds':10,'review_status':'provisional_unverified',
           'definition':'aligned_estimate = transit_raw + offset; illustrative only',
           'approved_for_use':False}],
      'clock_registry':[
        {'clock_id':'CLK-BANK-CAM','source_type':'bank_camera_recorders','status':'independent_source_clock'},
        {'clock_id':'CLK-BANK-SYS','source_type':'bank_alarm_system','status':'independent_source_clock'},
        {'clock_id':'CLK-TRANSIT-07','source_type':'transit_camera','status':'independent_source_clock'},
        {'clock_id':'CLK-INTERVIEW-ROOM-2','source_type':'interview_recording','status':'independent_source_clock'}],
      'assets':[{'asset_uuid':ASSET_UUID,'asset_id_scope':'DEMO_FIXTURE_LOCAL_NOT_DATABASE_ID','kind':'contour_extruded_placeholder','source_type':'hand_authored_synthetic_contour',
          'path':'assets/neutral-contour-placeholder.glb','sha256':asset_hash,'byte_length':asset_size,
          'is_illustrative':True,'is_evidence':False,'registry_state':'fixture_only'}],
      'scenes':scenes,
      'prosecutor_review_questions':[
        {'id':'RQ-01','question':'Which figures can be distinguished in the lobby footage?','status':'unresolved','refs':['CAM-LOBBY-01']},
        {'id':'RQ-02','question':'Does the evidence independently establish any actor carried a weapon?','status':'unresolved','refs':['W-02','CAM-LOBBY-01']},
        {'id':'RQ-03','question':'What explains the blocked rear corridor view?','status':'unresolved','refs':['CAM-REAR-02']},
        {'id':'RQ-04','question':'Can transit and bank clocks be aligned reliably?','status':'unresolved','refs':['CAM-TRANSIT-07','CAM-LOBBY-01']},
        {'id':'RQ-05','question':'Does any independent source support DET-01/POI-01 identity equivalence?','status':'unresolved','refs':['CAM-TRANSIT-07','INT-DET-01','CAM-LOBBY-01']},
        {'id':'RQ-06','question':'Which claims conflict with each interview statement, and what exculpatory gaps remain?','status':'unresolved','refs':['INT-DET-01','INT-DET-02','W-02']}],
      'persistence':{'scene_persistence_enabled_required_for_write':True,'current_mode':'fixture_read_only',
                     'requires_authorized_case_scope':True,'writes_performed':False},
      'disclaimer':'Entire case, people, locations, evidence metadata and interview text are fictional. No originals, GPS or real identity links.'
    }

def build():
    GLB.parent.mkdir(parents=True,exist_ok=True); FIXTURE.parent.mkdir(parents=True,exist_ok=True)
    blob=make_glb(OUTLINE)
    GLB.write_bytes(blob)
    sha=hashlib.sha256(blob).hexdigest()
    fixture=create_fixture(sha,len(blob))
    FIXTURE.write_text(json.dumps(fixture,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    return sha,len(blob),fixture

if __name__=='__main__':
    sha,size,fixture=build()
    print(f'Wrote {GLB.relative_to(ROOT)} {size} bytes sha256={sha}')
    print(f'Wrote {FIXTURE.relative_to(ROOT)}: {len(fixture["scenes"])} scenes, {len(fixture["person_registry"])} people, {len(fixture["prosecutor_review_questions"])} review questions')
