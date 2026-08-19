import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas_semantic512_runtime import (  # noqa: E402
    IdentityRow,
    Latent64Row,
    _l2_normalized,
    _manifest_checksum,
    _validate_identity,
)


def test_semantic512_normalization_is_unit_length():
    vector = [1.0] * 512
    normalized = _l2_normalized(vector, 512, "query")
    assert len(normalized) == 512
    assert math.sqrt(sum(value * value for value in normalized)) == pytest.approx(1.0, abs=1e-7)


def test_semantic512_rejects_wrong_dimension():
    with pytest.raises(ValueError, match="dimension 511 != 512"):
        _l2_normalized([1.0] * 511, 512, "query")


def test_manifest_requires_revision_qualified_unique_identity():
    rows = [
        IdentityRow(packetKey="packet:a", sourceRevision="17"),
        IdentityRow(packetKey="packet:b", sourceRevision="17", treeNodeId="tree:b"),
    ]
    _validate_identity(rows, "rows")
    checksum_a = _manifest_checksum(rows)
    checksum_b = _manifest_checksum(rows)
    assert checksum_a == checksum_b

    with pytest.raises(ValueError, match="duplicate"):
        _validate_identity(
            [
                IdentityRow(packetKey="packet:a", sourceRevision="17"),
                IdentityRow(packetKey="packet:a", sourceRevision="17"),
            ],
            "rows",
        )


def test_latent64_does_not_require_tree_or_feature_label():
    rows = [Latent64Row(packetKey="packet:a", sourceRevision="17", vector=[1.0] * 64)]
    _validate_identity(rows, "rows")
    normalized = _l2_normalized(rows[0].vector, 64, "latent")
    assert len(normalized) == 64
