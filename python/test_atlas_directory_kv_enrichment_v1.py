import polars as pl
import pytest

from atlas_directory_kv_enrichment_v1 import build

WORKSPACE_REVISION = "sha256:" + "a" * 64
INVENTORY_DIGEST = "sha256:" + "b" * 64
PRODUCER_REVISION = "test-producer-1"


def fixture_inventory() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "source_ref": ["src/a/one.svelte", "src/a/two.ts", "src/b/readme.md"],
            "extension": [".svelte", ".ts", ".md"],
            "byte_length": [100, 50, 25],
            "source_digest": ["sha256:" + "a" * 64, "sha256:" + "b" * 64, "sha256:" + "a" * 64],
        }
    )


def test_directory_enrichment_is_deterministic_and_proposal_only() -> None:
    inventory = fixture_inventory()
    provenance = {
        "workspace_revision": WORKSPACE_REVISION,
        "inventory_manifest_digest": INVENTORY_DIGEST,
        "producer_revision": PRODUCER_REVISION,
    }
    first = build(inventory, **provenance)
    second = build(inventory, **provenance)

    for first_frame, second_frame in zip(first[:2], second[:2], strict=True):
        assert first_frame.equals(second_frame)

    kv, wide, hints = first
    assert kv.get_column("schema").unique().to_list() == ["atlas.kv-enrichment.v2"]
    assert wide.height == 2
    assert kv.height == 22
    assert wide.get_column("file_count").sum() == 3
    assert wide.get_column("byte_total").sum() == 175
    assert wide.get_column("svelte_count").sum() == 1
    assert wide.get_column("duplicate_content_files").sum() == 2
    assert wide.null_count().sum_horizontal().sum() == 0
    assert [hint["directory_path"] for hint in hints] == ["src/a", "src/b"]
    assert all(hint["status"] == "HINT" for hint in hints)
    assert all(hint["packet_identity"] is None for hint in hints)
    assert all(hint["canonicalAuthority"] is False for hint in hints)
    assert all(hint["writesPerformed"] is False for hint in hints)
    assert all(hint["workspace_revision"] == WORKSPACE_REVISION for hint in hints)
    assert all(hint["inventory_manifest_digest"] == INVENTORY_DIGEST for hint in hints)
    assert all(hint["producer_revision"] == PRODUCER_REVISION for hint in hints)


def test_directory_enrichment_rejects_missing_or_malformed_lineage() -> None:
    inventory = fixture_inventory()
    with pytest.raises(ValueError, match="workspace_revision"):
        build(inventory, workspace_revision="unknown", inventory_manifest_digest=INVENTORY_DIGEST, producer_revision=PRODUCER_REVISION)
    with pytest.raises(ValueError, match="inventory_manifest_digest"):
        build(inventory, workspace_revision=WORKSPACE_REVISION, inventory_manifest_digest="unknown", producer_revision=PRODUCER_REVISION)
    with pytest.raises(ValueError, match="producer_revision"):
        build(inventory, workspace_revision=WORKSPACE_REVISION, inventory_manifest_digest=INVENTORY_DIGEST, producer_revision=" ")


def test_directory_enrichment_rejects_unqualified_inventory_rows() -> None:
    inventory = fixture_inventory().with_columns(pl.lit("not-a-digest").alias("source_digest"))
    with pytest.raises(ValueError, match="malformed source digest"):
        build(inventory, workspace_revision=WORKSPACE_REVISION, inventory_manifest_digest=INVENTORY_DIGEST, producer_revision=PRODUCER_REVISION)
