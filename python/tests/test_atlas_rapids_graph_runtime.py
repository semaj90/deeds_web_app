import importlib.util
import sys
import tempfile
import threading
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import networkx as nx

MODULE_PATH = Path(__file__).resolve().parents[1] / 'atlas_rapids_graph_runtime.py'
spec = importlib.util.spec_from_file_location('atlas_rapids_graph_runtime', MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def test_seed_normalization_is_order_stable_and_sums_to_one():
    normalized = module.normalize_seed_pairs([('b', 3.0), ('a', 1.0)])
    assert normalized == [('a', 0.25), ('b', 0.75)]
    assert abs(sum(weight for _, weight in normalized) - 1.0) < 1e-12


def test_seed_checksum_is_order_independent_for_same_weighted_seed_set():
    left = module.seed_checksum([('b', 3.0), ('a', 1.0)])
    right = module.seed_checksum([('a', 1.0), ('b', 3.0)])
    assert left == right


def test_seed_checksum_changes_when_personalization_changes():
    left = module.seed_checksum([('a', 1.0), ('b', 1.0)])
    right = module.seed_checksum([('a', 3.0), ('b', 1.0)])
    assert left != right


def test_seed_normalization_rejects_duplicate_identity():
    try:
        module.normalize_seed_pairs([('a', 1.0), ('a', 2.0)])
    except ValueError as exc:
        assert 'duplicate seed nodeKey' in str(exc)
    else:
        raise AssertionError('expected duplicate seed rejection')


def test_seed_normalization_rejects_non_positive_weights():
    for bad in (0.0, -1.0):
        try:
            module.normalize_seed_pairs([('a', bad)])
        except ValueError as exc:
            assert 'must be finite and > 0' in str(exc)
        else:
            raise AssertionError('expected invalid seed weight rejection')


def test_graph_parity_row_hash_matches_typescript_exporter_contract():
    node_rows = [{
        'gpu_node_id': 0,
        'graph_node_key': 'node:a',
        'node_kind': 'packet',
        'source_ref': 'src/a.ts',
        'source_revision': 'sha256:a',
        'workspace_revision': 'workspace:w1',
        'packet_key': 'packet:a',
        'symbol_id': None,
        'symbol_version_id': None,
    }]
    edge_rows = [{
        'src_gpu_node_id': 0,
        'dst_gpu_node_id': 1,
        'edge_type': 'CALLS',
        'weight': 1.0,
    }]
    assert module.hash_graph_snapshot_parity_rows_v1(node_rows) == (
        '0b6033cb835decb9d2544484f74d93b44f1e3f89d5ab1ede9f5e5f5c304b7978'
    )
    assert module.hash_graph_snapshot_parity_rows_v1(edge_rows) == (
        '931e03cec8e4060b4f24724ca83b29d0ead9c37ad03c50798d2b196abb9a8836'
    )


def test_resident_graph_rejects_table_content_drift_before_backend_init():
    node_frame = pd.DataFrame([{
        'gpu_node_id': 0,
        'graph_node_key': 'node:a',
        'node_kind': 'packet',
        'source_ref': 'src/a.ts',
        'source_revision': 'sha256:a',
        'workspace_revision': 'workspace:w1',
        'packet_key': 'packet:a',
        'symbol_id': None,
        'symbol_version_id': None,
    }])
    edge_frame = pd.DataFrame([{
        'src_gpu_node_id': 0,
        'dst_gpu_node_id': 0,
        'edge_type': 'SELF_TEST',
        'weight': 1.0,
    }])
    original = (
        module.cudf,
        module.cugraph,
        module.graph_ordinal_checksum_from_manifest_v1,
    )

    class FrameProxy:
        def __init__(self, frame):
            self.frame = frame
            self.columns = frame.columns

        def to_pandas(self):
            return self.frame

    module.cudf = SimpleNamespace(read_parquet=lambda path: FrameProxy(node_frame if Path(path).name == 'nodes.parquet' else edge_frame))
    module.cugraph = SimpleNamespace(Graph=lambda **kwargs: (_ for _ in ()).throw(AssertionError('backend must not initialize')))
    module.graph_ordinal_checksum_from_manifest_v1 = lambda manifest: 'ordinal-checksum'
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_dir = Path(temp_dir)
            (artifact_dir / 'nodes.parquet').touch()
            (artifact_dir / 'edges.parquet').touch()
            manifest = {
                'graphRevision': 'graph:r1',
                'projectionRevision': 'projection:r1',
                'nodeTableHash': 'incorrect-node-hash',
                'edgeTableHash': module.hash_graph_snapshot_parity_rows_v1(edge_frame.to_dict(orient='records')),
                'nodeCount': 1,
                'edgeCount': 1,
            }
            try:
                module.ResidentGraph(artifact_dir, manifest)
            except ValueError as exc:
                assert str(exc) == 'GRAPH_NODE_TABLE_CONTENT_HASH_MISMATCH'
            else:
                raise AssertionError('expected table-content hash rejection')
    finally:
        module.cudf, module.cugraph, module.graph_ordinal_checksum_from_manifest_v1 = original


def test_resident_source_ref_bfs_preserves_all_exact_revision_matches():
    calls = []

    class Resident:
        graph_revision = 'graph:r1'
        projection_revision = 'projection:r1'
        projection_checksum = 'projection-checksum'
        artifact_checksum = 'artifact-checksum'
        graph_ordinal_map_checksum = 'ordinal-checksum'
        workspace_revision = 'workspace:r1'
        gpu_id_to_identity = {
            3: {
                'nodeKey': 'packet:a', 'packetKey': 'packet:a', 'sourceRef': 'src/a.ts',
                'sourceRevision': 'source:r1', 'workspaceRevision': 'workspace:r1',
            },
            4: {
                'nodeKey': 'symbol:a', 'packetKey': 'packet:a', 'sourceRef': 'src/a.ts',
                'sourceRevision': 'source:r1', 'workspaceRevision': 'workspace:r1',
            },
            5: {
                'nodeKey': 'packet:b', 'packetKey': 'packet:b', 'sourceRef': 'src/b.ts',
                'sourceRevision': 'source:r1', 'workspaceRevision': 'workspace:r1',
            },
        }

        @staticmethod
        def bfs(req):
            calls.append(req.startNodeKey)
            ordinal = 3 if req.startNodeKey == 'packet:a' else 4
            return {
                'startNodeKey': req.startNodeKey,
                'results': [{'gpuNodeId': ordinal, 'nodeKey': req.startNodeKey}],
                'writesPerformed': False,
                'canonicalAuthority': False,
            }

    manager = module.GraphRuntimeManager.__new__(module.GraphRuntimeManager)
    manager._lock = threading.RLock()
    manager._resident = Resident()
    request = module.SourceRefBFSRequest(
        graphRevision='graph:r1',
        projectionRevision='projection:r1',
        projectionChecksum='projection-checksum',
        sourceRef='src/a.ts',
        expectedSourceRevision='source:r1',
        expectedWorkspaceRevision='workspace:r1',
        depthLimit=1,
        expectedArtifactChecksum='artifact-checksum',
        expectedGraphOrdinalMapChecksum='ordinal-checksum',
    )
    receipt = manager.source_ref_bfs(request)
    assert [match['graphOrdinal'] for match in receipt['matches']] == [3, 4]
    assert calls == ['packet:a', 'symbol:a']
    assert receipt['matches'][0]['traversal']['results'][0]['sourceRevision'] == 'source:r1'
    assert receipt['writesPerformed'] is False
    assert receipt['canonicalAuthority'] is False

    try:
        manager.source_ref_bfs(request.model_copy(update={'expectedSourceRevision': 'source:stale'}))
    except module.HTTPException as exc:
        assert exc.detail['code'] == 'GRAPH_SOURCE_REVISION_MISMATCH'
    else:
        raise AssertionError('expected stale source revision rejection')
    assert calls == ['packet:a', 'symbol:a']


def test_bfs_depth_modes_apply_default_expanded_and_hard_bounds():
    assert module.BFSRequest(graphRevision='g', startNodeKey='a').depthLimit == 2
    assert module.BFSRequest(graphRevision='g', startNodeKey='a', traversalMode='EXPANDED').depthLimit == 3
    assert module.BFSRequest(graphRevision='g', startNodeKey='a', traversalMode='MAXIMUM').depthLimit == 4
    for kwargs in (
        {'depthLimit': 3},
        {'traversalMode': 'EXPANDED', 'depthLimit': 4},
        {'traversalMode': 'MAXIMUM', 'depthLimit': 5},
    ):
        try:
            module.BFSRequest(graphRevision='g', startNodeKey='a', **kwargs)
        except ValueError:
            continue
        raise AssertionError(f'expected bounded BFS policy rejection: {kwargs}')


def test_bfs_path_receipt_reconstructs_and_checks_predecessor_chain():
    rows = [
        {'gpuNodeId': 2, 'nodeKey': 'c', 'distance': 2, 'predecessorGpuNodeId': 1},
        {'gpuNodeId': 0, 'nodeKey': 'a', 'distance': 0, 'predecessorGpuNodeId': None},
        {'gpuNodeId': 1, 'nodeKey': 'b', 'distance': 1, 'predecessorGpuNodeId': 0},
    ]
    binding = {
        'graph_revision': 'graph:r1',
        'projection_revision': 'projection:r1',
        'graph_ordinal_map_checksum': 'a' * 64,
    }
    receipt = module.build_bfs_path_receipt_v1('a', rows, 2, **binding)
    assert receipt['paths'][-1]['pathGraphNodeKeys'] == ['a', 'b', 'c']
    assert len(receipt['pathChecksum']) == 64
    assert receipt['graphRevision'] == binding['graph_revision']
    rebound = module.build_bfs_path_receipt_v1(
        'a', rows, 2, **{**binding, 'graph_revision': 'graph:r2'}
    )
    assert rebound['pathChecksum'] != receipt['pathChecksum']
    try:
        module.build_bfs_path_receipt_v1(
            'a', rows, 2, **{**binding, 'graph_ordinal_map_checksum': 'not-a-sha256'}
        )
    except ValueError as exc:
        assert 'GRAPH_BFS_REVISION_BINDING_REQUIRED' in str(exc)
    else:
        raise AssertionError('expected malformed ordinal checksum rejection')
    broken = [*rows[:-1], {**rows[-1], 'predecessorGpuNodeId': 99}]
    try:
        module.build_bfs_path_receipt_v1('a', broken, 2, **binding)
    except ValueError as exc:
        assert 'GRAPH_BFS_PREDECESSOR_CHAIN_INVALID' in str(exc)
    else:
        raise AssertionError('expected invalid predecessor chain rejection')
    try:
        module.build_bfs_path_receipt_v1('a', rows, 2)
    except TypeError:
        pass
    else:
        raise AssertionError('expected revision binding to be required')


def test_resident_bfs_returns_paths_and_noncanonical_receipt(monkeypatch):
    from types import SimpleNamespace

    runtime = module.ResidentGraph.__new__(module.ResidentGraph)
    runtime.node_count = 3
    runtime.edge_count = 2
    runtime.graph_revision = 'graph:r1'
    runtime.projection_revision = 'projection:r1'
    runtime.artifact_checksum = 'artifact-checksum'
    runtime.graph_ordinal_map_checksum = 'a' * 64
    runtime.renumbered = False
    runtime.graph = object()
    runtime.node_key_to_gpu_id = {'a': 0}
    runtime.gpu_id_to_identity = {
        0: {'nodeKey': 'a', 'packetKey': 'packet:a'},
        1: {'nodeKey': 'b', 'packetKey': 'packet:b'},
        2: {'nodeKey': 'c', 'packetKey': 'packet:c'},
    }
    frame = pd.DataFrame([
        {'vertex': 0, 'distance': 0, 'predecessor': -1},
        {'vertex': 1, 'distance': 1, 'predecessor': 0},
        {'vertex': 2, 'distance': 2, 'predecessor': 1},
    ])
    class FakeCuGraphFrame:
        def to_pandas(self):
            return frame

    monkeypatch.setattr(module, 'cugraph', SimpleNamespace(
        bfs=lambda graph, start, depth_limit, return_predecessors: FakeCuGraphFrame()
    ))

    result = runtime.bfs(module.BFSRequest(graphRevision='graph:r1', startNodeKey='a'))

    assert result['results'][2]['pathGraphNodeKeys'] == ['a', 'b', 'c']
    assert result['pathReceipt']['schema'] == 'atlas.graph-bfs-path-receipt.v1'
    assert result['pathReceipt']['pathCount'] == 3
    assert result['pathReceipt']['graphRevision'] == 'graph:r1'
    assert result['pathReceipt']['projectionRevision'] == 'projection:r1'
    assert result['pathReceipt']['graphOrdinalMapChecksum'] == 'a' * 64
    assert result['writesPerformed'] is False
    assert result['canonicalAuthority'] is False


def test_bfs_adapter_translates_renumbered_executor_ids_to_networkx_paths(monkeypatch):
    from types import SimpleNamespace

    oracle = nx.DiGraph([('a', 'b'), ('a', 'c'), ('b', 'd')])
    expected_paths = nx.single_source_shortest_path(oracle, 'a', cutoff=2)
    # Simulate a cuGraph-internal ordinal assignment unrelated to graph-node order.
    executor_ids = {'a': 17, 'b': 4, 'c': 22, 'd': 9}
    rows = [
        {'vertex': executor_ids['d'], 'distance': 2, 'predecessor': executor_ids['b']},
        {'vertex': executor_ids['c'], 'distance': 1, 'predecessor': executor_ids['a']},
        {'vertex': executor_ids['a'], 'distance': 0, 'predecessor': -1},
        {'vertex': executor_ids['b'], 'distance': 1, 'predecessor': executor_ids['a']},
    ]

    runtime = module.ResidentGraph.__new__(module.ResidentGraph)
    runtime.node_count = 4
    runtime.edge_count = 3
    runtime.graph_revision = 'graph:renumbered-r1'
    runtime.projection_revision = 'projection:renumbered-r1'
    runtime.artifact_checksum = 'artifact-renumbered'
    runtime.graph_ordinal_map_checksum = 'b' * 64
    runtime.renumbered = True
    runtime.graph = object()
    runtime.node_key_to_gpu_id = {'a': executor_ids['a']}
    runtime.gpu_id_to_identity = {
        executor_id: {'nodeKey': node_key, 'packetKey': f'packet:{node_key}'}
        for node_key, executor_id in executor_ids.items()
    }

    class FakeCuGraphFrame:
        def to_pandas(self):
            return pd.DataFrame(rows)

    monkeypatch.setattr(module, 'cugraph', SimpleNamespace(
        bfs=lambda graph, start, depth_limit, return_predecessors: FakeCuGraphFrame()
    ))
    request = module.BFSRequest(graphRevision='graph:renumbered-r1', startNodeKey='a')
    first = runtime.bfs(request)
    second = runtime.bfs(request)

    actual_paths = {
        row['nodeKey']: row['pathGraphNodeKeys']
        for row in first['results']
    }
    assert actual_paths == expected_paths
    assert first['renumbered'] is True
    assert first['pathReceipt']['pathChecksum'] == second['pathReceipt']['pathChecksum']
