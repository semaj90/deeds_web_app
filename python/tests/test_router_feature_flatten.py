import importlib.util
import json
import sys
from pathlib import Path

import pytest

MODULE_PATH = Path(__file__).resolve().parents[1] / "atlas_compute" / "router_feature_flatten.py"
spec = importlib.util.spec_from_file_location("router_feature_flatten", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def sample_row():
    return {
        "schema": "atlas.retrieval-router-feature-row.v1",
        "semantic": {"cosine": 0.25},
        "latent": {"vector": [0.0] * 64},
        "structure": {
            "hasFunction": True, "hasCall": False, "hasDatabaseAccess": True,
            "hasNetworkCall": False, "hasTest": True, "hasErrorHandler": False,
            "astPatternMask": [0] * 32,
        },
        "ontology": {"mask": [1] + [0] * 31},
        "lexical": {
            "nounDensity": None, "verbDensity": 0.0, "identifierOverlap": 0.5,
            "bm25Score": 2.0, "bm42ChallengerScore": None,
        },
        "graph": {
            "pageRank": 0.0, "personalizedPageRank": None, "degree": 2,
            "hopDistance": 1,
        },
        "cluster": {
            "kmeansClusterId": None, "kmeansProbability": 0.75, "somRow": 3,
            "somCol": 4, "somDistance": None,
        },
        "temporal": {"recency": 1.0, "changeFrequency": None},
        "evidence": {
            "groundingExact": True, "validatorPassed": False, "authorityWeight": None,
        },
    }


def test_field_order_is_fixed_and_missing_is_distinct_from_zero():
    row = sample_row()
    vector = module.flatten_router_feature_row_v1(row)
    repeated = module.flatten_router_feature_row_v1(row)

    assert vector == repeated
    assert len(vector) == 173
    assert vector[0:2] == (0.25, 1.0)  # semantic.cosine and present
    assert vector[2:67][-1] == 1.0  # latent vector and present
    assert vector[67:73] == (1.0, 0.0, 1.0, 0.0, 1.0, 0.0)
    assert module.router_feature_order_revision_v1() == "retrieval-router-feature-order-v1"


def test_nullable_latent_and_scalar_values_use_zero_plus_absent_bit():
    row = sample_row()
    row["semantic"]["cosine"] = None
    row["latent"]["vector"] = None
    vector = module.flatten_router_feature_row_v1(row)

    assert vector[0:2] == (0.0, 0.0)
    assert vector[2:67] == (0.0,) * 65


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda row: row.update(schema="wrong"), "ROUTER_FEATURE_ROW_SCHEMA_MISMATCH"),
        (lambda row: row["latent"].update(vector=[0.0]), "ROUTER_FEATURE_ARRAY_LENGTH_INVALID"),
        (lambda row: row["semantic"].update(cosine=float("nan")), "ROUTER_FEATURE_NUMBER_NONFINITE"),
        (lambda row: row["structure"].update(hasCall=1), "ROUTER_FEATURE_BOOLEAN_INVALID"),
    ],
)
def test_invalid_row_values_fail_closed(mutate, message):
    row = sample_row()
    mutate(row)
    with pytest.raises(ValueError, match=message):
        module.flatten_router_feature_row_v1(row)
