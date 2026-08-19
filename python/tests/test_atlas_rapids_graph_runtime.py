import importlib.util
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / 'atlas_rapids_graph_runtime.py'
spec = importlib.util.spec_from_file_location('atlas_rapids_graph_runtime', MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
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
