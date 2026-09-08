from atlas_gemma_rank_ordered_embedding_alignment_proof_v1 import prove_ordered_embedding_alignment


def test_proves_reversible_ordered_embedding_permutation_without_target_claim():
    result = prove_ordered_embedding_alignment(
        vocab_size=4,
        embedding_shape=[4, 8],
        token_ordering=[2, 0, 3, 1],
        tokenizer_ids={0, 1, 2, 3},
        special_token_ids={"<bos>": 0, "<eos>": 1},
    )

    assert result["status"] == "ORDERED_EMBEDDING_PERMUTATION_PROVEN_TARGET_ALIGNMENT_OPEN"
    assert result["tokenOrderingIsPermutation"] is True
    assert result["permutationRoundTrip"] is True
    assert result["tokenizerIdsInBounds"] is True
    assert result["canonicalTargetAlignmentProven"] is False
    assert result["tokenOrderingDirection"] == "ordered_position_to_canonical_token_id"
    assert result["sampleMappings"][0] == {
        "canonicalTokenId": 0,
        "orderedPosition": 1,
        "roundTripCanonicalTokenId": 0,
    }


def test_rejects_duplicate_or_out_of_range_ordering():
    result = prove_ordered_embedding_alignment(
        vocab_size=4,
        embedding_shape=[4, 8],
        token_ordering=[2, 0, 2, 4],
        tokenizer_ids={0, 1, 2, 3},
        special_token_ids={},
    )

    assert result["status"] == "BLOCKED_ORDERED_EMBEDDING_ALIGNMENT"
    assert result["tokenOrderingIsPermutation"] is False
    assert result["permutationRoundTrip"] is False


def test_rejects_tokenizer_ids_outside_embedding_rows():
    result = prove_ordered_embedding_alignment(
        vocab_size=4,
        embedding_shape=[4, 8],
        token_ordering=[2, 0, 3, 1],
        tokenizer_ids={0, 5},
        special_token_ids={},
    )

    assert result["status"] == "BLOCKED_ORDERED_EMBEDDING_ALIGNMENT"
    assert result["tokenizerIdsInBounds"] is False
