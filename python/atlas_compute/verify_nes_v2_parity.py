"""Read-only v1/v2 NES palette and ontology crosswalk verification.

The JSON checksum recipe matches the current Node generator for the pinned
artifacts. Never assigns source identity, reviewed labels, or canonicality.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

try:
    from atlas_compute.nes_lut_palette_v2_candidate import load_nes_palette_v2_candidate
except ModuleNotFoundError as exc:
    if exc.name != 'atlas_compute':
        raise
    from nes_lut_palette_v2_candidate import load_nes_palette_v2_candidate


def digest(data: bytes) -> str:
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def checksum(document: dict[str, Any]) -> str:
    unsigned = {k: v for k, v in document.items() if k != 'checksum'}
    return digest(json.dumps(unsigned, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8'))


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise ValueError(reason)


def verify(root: Path) -> dict[str, Any]:
    root = root.resolve()
    source = root / 'scripts/atlas/data/nes-domain-palette-v1.json'
    if not source.is_file():
        source = root / 'fixtures/nes-domain-palette-v1.json'
    palette_path = root / 'scripts/atlas/data/nes-domain-palette-v2.candidate.json'
    crosswalk_path = root / 'docs/reports/domain-ontology-nes-v2-crosswalk.candidate.json'
    ontology_path = root / '.okf/domains/atlas-domain-taxonomy.yaml'
    if not ontology_path.is_file():
        ontology_path = root / 'fixtures/atlas-domain-taxonomy.yaml'

    v1 = json.loads(source.read_text(encoding='utf-8'))
    v2 = load_nes_palette_v2_candidate(palette_path, source)
    crosswalk = json.loads(crosswalk_path.read_text(encoding='utf-8'))
    ontology = ontology_path.read_bytes()
    for document in (v1, v2, crosswalk):
        require(document.get('checksum') == checksum(document), 'DOCUMENT_CHECKSUM_DRIFT')
    require(v1.get('revision') == 'nes-domain-palette-v1', 'V1_REVISION_INVALID')
    require(v2.get('revision') == 'nes-domain-palette-v2-candidate', 'V2_REVISION_INVALID')
    require(v2.get('baselineV1Checksum') == v1['checksum'], 'BASELINE_BINDING_DRIFT')
    require(crosswalk.get('schema') == 'atlas.domain-ontology-nes-crosswalk.v2-candidate', 'CROSSWALK_SCHEMA_INVALID')
    require(crosswalk.get('status') == 'CANDIDATE_NOT_APPLIED', 'CROSSWALK_STATUS_INVALID')
    require(crosswalk.get('canonicalAuthority') is False and crosswalk.get('writesPerformed') is False, 'AUTHORITY_INVALID')
    require(crosswalk.get('paletteRevision') == v2['revision'] and crosswalk.get('paletteChecksum') == v2['checksum'], 'CROSSWALK_PALETTE_DRIFT')
    require(crosswalk.get('sourceTaxonomyYamlSha256') == digest(ontology), 'SOURCE_YAML_HASH_DRIFT')
    groups = re.findall(rb'^\s*- group_id: ([a-z]+(?:-[a-z]+)*(?:\.[a-z]+(?:-[a-z]+)*)?)\s*$', ontology, flags=re.MULTILINE)
    group_ids = {g.decode('ascii') for g in groups}
    rows = crosswalk.get('rows')
    require(isinstance(rows, list) and len(groups) == len(group_ids) == len(rows) == 17, 'ONTOLOGY_CARDINALITY_INVALID')
    require(crosswalk.get('sourceGroupCount') == 17 and crosswalk.get('paletteDomainCount') == 14, 'CROSSWALK_COUNTS_INVALID')
    require({r['groupId'] for r in rows} == group_ids and 'agent' not in group_ids, 'ONTOLOGY_MAPPING_COVERAGE_INVALID')
    for row in rows:
        entry = v2['domains'].get(row['domain'])
        require(entry is not None, 'UNKNOWN_MAPPED_PALETTE_DOMAIN')
        require(entry['lutByte'] == row['lutByte'] and entry['nesHex'] == row['nesHex'], 'CROSSWALK_BYTE_COLOR_DRIFT')
        require(row.get('authoritativeLabel') is False, 'REVIEW_AUTHORITY_FORBIDDEN')
    require(v2['domains']['general']['lutByte'] == 10 and v2['unresolved']['lutByte'] == 0, 'GENERAL_UNRESOLVED_COLLISION')
    require({v['lutByte'] for v in v2['domains'].values()} == set(range(1, 15)), 'PALETTE_BYTE_REGISTRY_INVALID')
    require(len({v['nesHex'] for v in v2['domains'].values()}) == 14, 'PALETTE_COLOR_REGISTRY_DUPLICATE')
    expected_groups = {
        'api': 'network', 'auth': 'auth', 'cache': 'cache', 'compiler': 'compiler',
        'database': 'database', 'database.postgresql': 'database', 'devops': 'devops',
        'devops.env-config': 'devops', 'devops.process-mgmt': 'devops',
        'error-handling': 'error-handling', 'frontend': 'ui', 'frontend.sveltekit': 'ui',
        'gpu': 'ml', 'graph': 'graph', 'machine-learning': 'ml',
        'retrieval': 'retrieval', 'test': 'test'
    }
    require({r['groupId']: r['domain'] for r in rows} == expected_groups, 'UNAPPROVED_GROUP_ROLLUP')
    proposed = root / 'scripts/atlas/data/nes-domain-palette-v2-PROPOSED.json'
    if proposed.is_file():
        other = json.loads(proposed.read_text(encoding='utf-8'))
        changes = {name: {'candidate': entry, 'branchProposed': other.get('domains', {}).get(name)}
                   for name, entry in v2['domains'].items() if entry != other.get('domains', {}).get(name)}
        raise ValueError('COMPETING_V2_CANDIDATES_NOT_RECONCILED:' + ','.join(sorted(changes)))
    return {
        'status': 'PARITY_PASS', 'candidateOnly': True, 'databaseWrites': 0,
        'v1Checksum': v1['checksum'], 'v2Checksum': v2['checksum'],
        'crosswalkChecksum': crosswalk['checksum'], 'yamlSha256': digest(ontology),
        'v2FileSha256': digest(palette_path.read_bytes()),
        'domains': len(v2['domains']), 'ontologyGroups': len(groups),
        'generalByte': 10, 'unresolvedByte': 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    ns = parser.parse_args()
    try:
        print(json.dumps(verify(ns.root), separators=(',', ':')))
        return 0
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(json.dumps({'status': 'BLOCKED', 'reason': str(exc)[:350]}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
