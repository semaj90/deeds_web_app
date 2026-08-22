import importlib.util
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / 'atlas_rapids_graph_traversal_runtime.py'
spec = importlib.util.spec_from_file_location('atlas_rapids_graph_traversal_runtime', MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


def request(**overrides):
    values = {
        'graphRevision': 'g1',
        'seedNodeKey': 'n1',
        'candidateNodeKeys': ['n2', 'n3'],
        'maxHops': 2,
        'maxNodes': 32,
        'direction': 'outbound',
        'deadlineMs': 1000,
    }
    values.update(overrides)
    return module.GraphBfsRequest(**values)


def test_outbound_bfs_request_is_accepted():
    module.validate_bfs_request(request())


def test_reverse_direction_fails_closed():
    for direction in ('inbound', 'both'):
        try:
            module.validate_bfs_request(request(direction=direction))
        except ValueError as exc:
            assert 'CUGRAPH_BFS_OUTBOUND_ONLY' in str(exc)
        else:
            raise AssertionError('expected reverse traversal rejection')


def test_duplicate_candidate_identity_is_rejected():
    try:
        module.validate_bfs_request(request(candidateNodeKeys=['n2', 'n2']))
    except ValueError as exc:
        assert 'duplicate candidate nodeKey' in str(exc)
    else:
        raise AssertionError('expected duplicate candidate rejection')


def test_hop_and_result_envelopes_fail_closed():
    for field, value in [('maxHops', 5), ('maxNodes', 513)]:
        try:
            module.validate_bfs_request(request(**{field: value}))
        except ValueError:
            pass
        else:
            raise AssertionError(f'expected {field} bound rejection')


def test_deadline_must_be_positive():
    try:
        module.validate_bfs_request(request(deadlineMs=0))
    except TimeoutError as exc:
        assert 'deadlineMs must be positive' in str(exc)
    else:
        raise AssertionError('expected deadline rejection')
