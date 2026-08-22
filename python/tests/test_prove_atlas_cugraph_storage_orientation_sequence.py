import importlib.util
import math
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / 'prove_atlas_cugraph_storage_orientation_sequence.py'
spec = importlib.util.spec_from_file_location('prove_atlas_cugraph_storage_orientation_sequence', MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


def test_orientation_sequence_has_two_forced_flips_after_first_pagerank():
    sequence = module.orientation_sequence()
    assert [step['orientationRequired'] for step in sequence] == [
        'TRANSPOSED',
        'NON_TRANSPOSED',
        'TRANSPOSED',
    ]
    assert sequence[0]['forcedStorageFlip'] is None
    assert sequence[1]['forcedStorageFlip'] is True
    assert sequence[2]['forcedStorageFlip'] is True


def test_pagerank_repeat_delta_is_order_independent_by_node_key():
    left = [
        {'nodeKey': 'a', 'score': 0.25},
        {'nodeKey': 'b', 'score': 0.75},
    ]
    right = [
        {'nodeKey': 'b', 'score': 0.75000001},
        {'nodeKey': 'a', 'score': 0.25},
    ]
    assert abs(module.max_abs_score_delta(left, right) - 1e-8) < 1e-12


def test_pagerank_repeat_delta_fails_closed_on_different_node_sets():
    assert math.isinf(
        module.max_abs_score_delta(
            [{'nodeKey': 'a', 'score': 1.0}],
            [{'nodeKey': 'b', 'score': 1.0}],
        )
    )


def test_ranked_node_key_parity_preserves_order():
    left = [{'nodeKey': 'a'}, {'nodeKey': 'b'}]
    assert module.same_ranked_node_keys(left, left)
    assert not module.same_ranked_node_keys(left, list(reversed(left)))


def test_receipt_checksum_is_deterministic_for_same_payload():
    payload = {'b': 2, 'a': {'x': 1}}
    assert module.checksum(payload) == module.checksum({'a': {'x': 1}, 'b': 2})
