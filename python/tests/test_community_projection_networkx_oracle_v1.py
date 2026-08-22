import importlib.util
from pathlib import Path

import pytest

MODULE_PATH = Path(__file__).resolve().parents[1] / 'community_projection_networkx_oracle_v1.py'
spec = importlib.util.spec_from_file_location('community_projection_networkx_oracle_v1', MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


def projection():
    base = {
        'schema': 'atlas.undirected-community-projection.v1',
        'sourceGraphRevision': 'graph-r1',
        'sourceProjectionRevision': 'projection-r1',
        'sourceNodeTableHash': 'node-hash',
        'sourceEdgeTableHash': 'edge-hash',
        'projectionRevision': 'community-r1',
        'policyRevision': 'policy-r1',
        'policyChecksum': 'policy-checksum',
        'vertexIds': [0, 1, 2, 3, 4],
        'edges': [
            {'uGpuNodeId': 0, 'vGpuNodeId': 1, 'weight': 5.0},
            {'uGpuNodeId': 1, 'vGpuNodeId': 2, 'weight': 5.0},
            {'uGpuNodeId': 0, 'vGpuNodeId': 2, 'weight': 5.0},
            {'uGpuNodeId': 3, 'vGpuNodeId': 4, 'weight': 5.0},
            {'uGpuNodeId': 2, 'vGpuNodeId': 3, 'weight': 0.1},
        ],
        'identityAuthority': False,
        'communityIdsAssigned': False,
        'canonicalWritesAttempted': False,
    }
    without_checksum = dict(base)
    base['projectionChecksum'] = module.checksum(without_checksum)
    return base


def test_canonicalize_communities_is_label_and_iteration_order_independent():
    left = [{4, 3}, {2, 0, 1}]
    right = [{1, 2, 0}, {3, 4}]
    assert module.canonicalize_communities(left) == [[0, 1, 2], [3, 4]]
    assert module.canonicalize_communities(left) == module.canonicalize_communities(right)
    assert module.build_partition_rows(left) == module.build_partition_rows(right)


def test_validate_projection_rejects_identity_authority():
    payload = projection()
    payload['identityAuthority'] = True
    with pytest.raises(ValueError, match='COMMUNITY_PROJECTION_MUST_NOT_BE_IDENTITY_AUTHORITY'):
        module.validate_projection(payload)


def test_validate_projection_rejects_noncanonical_undirected_edge_order():
    payload = projection()
    payload['edges'] = [{'uGpuNodeId': 2, 'vGpuNodeId': 1, 'weight': 1.0}]
    with pytest.raises(ValueError, match='COMMUNITY_PROJECTION_UNDIRECTED_EDGE_INVALID'):
        module.validate_projection(payload)


@pytest.mark.skipif(module.nx is None, reason='networkx not installed in this test environment')
def test_seeded_louvain_receipt_is_repeatable_and_non_authoritative():
    payload = projection()
    first = module.run(payload, seed=42)
    second = module.run(payload, seed=42)
    assert first['partitionChecksum'] == second['partitionChecksum']
    assert first['receiptChecksum'] == second['receiptChecksum']
    assert first['communityCount'] == second['communityCount']
    assert first['identityAuthority'] is False
    assert first['rankingVoteProduced'] is False
    assert first['canonicalWritesAttempted'] is False
    assert first['algorithmParityClaimed'] is False
    assert first['challengerRole'] == 'CPU_COMMUNITY_STRUCTURE_CHALLENGER'


@pytest.mark.skipif(module.nx is None, reason='networkx not installed in this test environment')
def test_isolated_vertex_receives_a_partition_row():
    payload = projection()
    payload['edges'] = [{'uGpuNodeId': 0, 'vGpuNodeId': 1, 'weight': 1.0}]
    result = module.run(payload, seed=7)
    assert {row['gpuNodeId'] for row in result['partitions']} == set(payload['vertexIds'])
