import hashlib
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LIB_ROOT = REPO_ROOT / "python" / "atlas_corpus_lib"
if str(LIB_ROOT) not in sys.path:
    sys.path.insert(0, str(LIB_ROOT))

from atlas_corpus_lib.nes_taxonomy_registry import (
    AtlasFeatureRowV1,
    CANONICAL_DOMAIN_IDS,
    HOT_FEATURE_BITS,
    compute_feature_mask_from_labels,
)
from atlas_corpus_lib.gpu_feature_tile_builder import (
    AtlasGpuFeatureTileV1,
    FeatureCandidateInputV1,
    assemble_gpu_feature_tile,
)

def test_atlas_feature_row_abi():
    row = AtlasFeatureRowV1(
        candidate_ordinal=101,
        domain_id=2,  # ui
        symbol_kind_id=3,  # component
        feature_mask_lo=0x00000007,
        feature_mask_hi=0x00000001,
        relation_offset=512,
        relation_count=4,
        diagnostic_flags=0,
    )
    raw = row.to_bytes()
    assert len(raw) == 24, f"Expected 24 bytes, got {len(raw)}"

    unpacked = AtlasFeatureRowV1.from_bytes(raw)
    assert unpacked == row
    assert unpacked.feature_mask_64 == (1 << 32) | 7
    print("PASS: AtlasFeatureRowV1 24-byte ABI packing/unpacking verified.")

def test_feature_tile_assembly():
    scratch_dir = REPO_ROOT / ".tmp" / "atlas" / "scratch_gpu_feature_tiles"
    scratch_dir.mkdir(parents=True, exist_ok=True)

    dummy_numeric = [0.1 * (i % 10) for i in range(64)]

    candidates = [
        FeatureCandidateInputV1(
            source_ref="sveltekit-frontend/src/lib/components/AIChatAssistant.svelte",
            symbol_name="AIChatAssistant",
            domain_name="ui",
            symbol_kind="component",
            feature_labels=["svelte.runes.state", "svelte.component.props", "ui.bits_ui.primitive"],
            numeric_features_64=dummy_numeric,
            relation_offset=0,
            relation_count=5,
            diagnostic_flags=0,
        ),
        FeatureCandidateInputV1(
            source_ref="sveltekit-frontend/src/lib/server/vector/turbovec-contract.ts",
            symbol_name="TURBOVEC_INDEX_DIMENSION",
            domain_name="retrieval",
            symbol_kind="variable",
            feature_labels=["vector.turbovec.4bit", "vector.mrl128.prefix"],
            numeric_features_64=dummy_numeric,
            relation_offset=5,
            relation_count=2,
            diagnostic_flags=0,
        ),
    ]

    snap_rev = "sha256:" + ("a" * 64)
    tax_rev = "sha256:" + ("b" * 64)
    recipe_rev = "sha256:" + ("c" * 64)

    envelope, cat_bytes, num_bytes, ord_str = assemble_gpu_feature_tile(
        candidates,
        snapshot_revision=snap_rev,
        taxonomy_revision=tax_rev,
        feature_recipe_revision=recipe_rev,
        output_dir=scratch_dir,
        tile_name_prefix="test_tile_01",
    )

    assert envelope.row_count == 2
    assert envelope.feature_dimension == 64
    assert len(cat_bytes) == 2 * 24
    assert len(num_bytes) == 2 * 64 * 4
    assert envelope.status == "PROPOSAL_ONLY"
    assert envelope.identity_authority is False

    # Verify digests on readback
    assert envelope.categorical_digest == f"sha256:{hashlib.sha256(cat_bytes).hexdigest()}"
    assert envelope.numeric_digest == f"sha256:{hashlib.sha256(num_bytes).hexdigest()}"

    print(f"PASS: Feature tile assembled successfully ({len(cat_bytes)}B categorical, {len(num_bytes)}B numeric).")
    print(f"Envelope: row_count={envelope.row_count}, numericDigest={envelope.numeric_digest[:20]}...")

if __name__ == "__main__":
    test_atlas_feature_row_abi()
    test_feature_tile_assembly()
    print("ALL PYTHON GPU FEATURE TILE TESTS PASSED SUCCESSFULLY.")
