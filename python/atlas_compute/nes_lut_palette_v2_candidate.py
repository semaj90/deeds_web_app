"""Opt-in NES palette v2 candidate loader. Does not change v1 defaults or training authority."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[2]
V1_PATH = _ROOT / 'scripts/atlas/data/nes-domain-palette-v1.json'
V2_PATH = _ROOT / 'scripts/atlas/data/nes-domain-palette-v2.candidate.json'

def _check_checksum(data: dict[str, Any]) -> None:
    checksum = data.get('checksum')
    unsigned = {k:v for k,v in data.items() if k != 'checksum'}
    expected = 'sha256:' + hashlib.sha256(json.dumps(unsigned,ensure_ascii=False,separators=(',', ':')).encode()).hexdigest()
    if checksum != expected:
        raise ValueError('NES_PALETTE_CHECKSUM_MISMATCH')

def load_nes_palette_v2_candidate(v2_path: Path = V2_PATH, v1_path: Path = V1_PATH) -> dict[str, Any]:
    v1=json.loads(v1_path.read_text(encoding='utf-8'))
    v2=json.loads(v2_path.read_text(encoding='utf-8'))
    _check_checksum(v1); _check_checksum(v2)
    if (v1.get('schema'),v2.get('schema')) != ('atlas.nes-domain-palette.v1','atlas.nes-domain-palette.v2'):
        raise ValueError('NES_PALETTE_SCHEMA_MISMATCH')
    if v2.get('status')!='CANDIDATE_NOT_APPLIED' or v2.get('canonicalAuthority') is not False:
        raise ValueError('V2_CANDIDATE_AUTHORITY_INVALID')
    if v2.get('baselineV1Checksum')!=v1['checksum'] or v2.get('unresolved',{}).get('lutByte')!=0:
        raise ValueError('V1_BASELINE_V2_DRIFT')
    if len(v1['domains'])!=10 or len(v2['domains'])!=14:
        raise ValueError('DOMAIN_COUNT_INVALID')
    for name, e in v1['domains'].items():
        if v2['domains'].get(name)!=e:
            raise ValueError(f'V1_DOMAIN_CHANGED:{name}')
    ids=[e['lutByte'] for e in v2['domains'].values()]
    if len(ids)!=len(set(ids)) or 0 in ids or set(ids)!=set(range(1,15)):
        raise ValueError('NES_DOMAIN_BYTE_INVALID')
    return v2

def resolve_proposed_domain(candidate: str, palette: dict[str,Any]) -> dict[str,Any]:
    """Never silently relabel unresolved as general."""
    domain=palette['domains'].get(candidate)
    if not domain:
        return {'domain': None,'lutByte':0,'status':'UNRESOLVED','canonicalAuthority':False}
    return {'domain':candidate,'lutByte':domain['lutByte'],'nesHex':domain['nesHex'],
            'status':'PALETTE_MATCH_PROPOSAL','canonicalAuthority':False}
