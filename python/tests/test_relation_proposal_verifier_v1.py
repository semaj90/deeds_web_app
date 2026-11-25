from __future__ import annotations

import json
import hashlib
from pathlib import Path

from atlas_graph_runtime.relation_proposal_verifier_v1 import (
    extract_and_verify_import_proposals_from_chunks_v1,
    verify_relation_proposal_v1,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC_REV = "sha256:" + "a" * 64
CONTENT_SHA = "b" * 64


def test_rejects_self_admitted_relation_and_span_byte_mismatch():
    source_bytes = b"import { foo } from './bar';\n"
    self_admit = verify_relation_proposal_v1(
        {
            "chunkId": "c1",
            "sourceRef": "src/a.ts",
            "sourceRevision": SRC_REV,
            "contentSha256": CONTENT_SHA,
            "predicate": "IMPORTS",
            "subject": "src/a.ts",
            "object": "./bar",
            "startByte": 0,
            "endByte": 27,
            "exactText": "import { foo } from './bar'",
            "extractorVersion": "v1",
            "status": "GRAPH_ADMITTED",
        },
        source_bytes=source_bytes,
    )
    assert self_admit["accepted"] is False
    assert self_admit["failure"] == "EXTRACTOR_CANNOT_SELF_ADMIT"

    bad_span = verify_relation_proposal_v1(
        {
            "chunkId": "c1",
            "sourceRef": "src/a.ts",
            "sourceRevision": SRC_REV,
            "contentSha256": CONTENT_SHA,
            "predicate": "IMPORTS",
            "subject": "src/a.ts",
            "object": "./bar",
            "startByte": 0,
            "endByte": 10,
            "exactText": "wrong text",
            "extractorVersion": "v1",
            "status": "PROPOSED",
        },
        source_bytes=source_bytes,
    )
    assert bad_span["accepted"] is False
    assert bad_span["failure"] == "SPAN_BYTE_MISMATCH"


def test_retains_unresolved_oak_mapping_and_verifies_utf8_bytes_from_doc14_chunks():
    source_bytes = "// café\nimport { x } from '$lib/db';\n".encode("utf-8")
    start_b = source_bytes.index(b"import")
    end_b = source_bytes.index(b";")
    ok = verify_relation_proposal_v1(
        {
            "chunkId": "c2",
            "sourceRef": "src/a.ts",
            "sourceRevision": SRC_REV,
            "contentSha256": CONTENT_SHA,
            "predicate": "IMPORTS",
            "subject": "src/a.ts",
            "object": "$lib/db",
            "startByte": start_b,
            "endByte": end_b,
            "exactText": "import { x } from '$lib/db'",
            "extractorVersion": "v1",
            "status": "PROPOSED",
        },
        source_bytes=source_bytes,
        oak_suggest_fn=lambda _obj: [],
    )
    assert ok["accepted"] is True
    assert ok["proposal"]["status"] == "PROPOSED"
    assert ok["proposal"]["mappingStatus"] == "UNRESOLVED"
    assert ok["proposal"]["spanVerified"] is True
    assert ok["proposal"]["sourceContentHashStatus"] == "CARRIED_NOT_REHASHED"
    assert ok["proposal"]["chunkSha256"] == hashlib.sha256(source_bytes).hexdigest()

    chunks_path = REPO_ROOT / "docs" / "reports" / "doc14-admitted-chunks.jsonl"
    chunks = [json.loads(line) for line in chunks_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    batch = extract_and_verify_import_proposals_from_chunks_v1(chunks)
    assert batch["rejectedCount"] == 0
    assert batch["canonicalAuthority"] is False
    assert batch["writesPerformed"] is False

    missing_chunk_hash = extract_and_verify_import_proposals_from_chunks_v1([{
        "chunkId": "unqualified", "sourceRef": "src/u.ts", "sourceRevision": SRC_REV,
        "contentSha256": CONTENT_SHA, "text": "import x from './x';",
    }])
    assert missing_chunk_hash["verifiedCount"] == 0
    assert missing_chunk_hash["rejected"] == [{"chunkId": "unqualified", "sourceRef": "src/u.ts", "failure": "CHUNK_SHA256_REQUIRED"}]


def test_rejects_mismatched_chunk_hash_and_invalid_utf8_span():
    source_bytes = b"import { x } from './x';"
    base = {
        "chunkId": "c3", "sourceRef": "src/c.ts", "sourceRevision": SRC_REV,
        "contentSha256": CONTENT_SHA, "chunkSha256": "0" * 64,
        "predicate": "IMPORTS", "subject": "src/c.ts", "object": "./x",
        "startByte": 0, "endByte": len(source_bytes), "exactText": source_bytes.decode(),
        "extractorVersion": "v1", "status": "PROPOSED",
    }
    mismatch = verify_relation_proposal_v1(base, source_bytes=source_bytes)
    assert mismatch["accepted"] is False
    assert mismatch["failure"] == "CHUNK_SHA256_MISMATCH"

    invalid_utf8 = verify_relation_proposal_v1(
        {**base, "chunkSha256": hashlib.sha256(b"\xff").hexdigest(), "startByte": 0, "endByte": 1, "exactText": "�"},
        source_bytes=b"\xff",
    )
    assert invalid_utf8["accepted"] is False
    assert invalid_utf8["failure"] == "SPAN_SOURCE_NOT_UTF8"


def test_rejects_missing_or_malformed_source_content_hash():
    source_bytes = b"import x from './x';"
    base = {
        "chunkId": "c4", "sourceRef": "src/c.ts", "sourceRevision": SRC_REV,
        "predicate": "IMPORTS", "subject": "src/c.ts", "object": "./x",
        "startByte": 0, "endByte": len(source_bytes), "exactText": source_bytes.decode(),
        "extractorVersion": "v1", "status": "PROPOSED",
    }
    missing = verify_relation_proposal_v1(base, source_bytes=source_bytes)
    assert missing["accepted"] is False
    assert missing["failure"] == "PROPOSAL_FIELDS_INCOMPLETE"

    malformed = verify_relation_proposal_v1({**base, "contentSha256": "sha256:" + CONTENT_SHA}, source_bytes=source_bytes)
    assert malformed["accepted"] is False
    assert malformed["failure"] == "INVALID_CONTENT_SHA256"


def test_compiles_to_relation_suggests_both_ontology_endpoints_and_stays_proposed():
    source_bytes = b"NVRTC compiles CUDA C++ device code to PTX."
    exact_text = source_bytes.decode("utf-8")
    suggestions = {
        "CUDA C++": [{"conceptId": "ATLASLANG:cuda_cpp"}],
        "PTX": [{"conceptId": "ATLASISA:ptx"}],
    }
    result = verify_relation_proposal_v1(
        {
            "chunkId": "official-capture:cuda-ptx-sentence",
            "sourceRef": "https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/cuda-platform.html",
            "sourceRevision": SRC_REV,
            "contentSha256": CONTENT_SHA,
            "chunkSha256": hashlib.sha256(source_bytes).hexdigest(),
            "predicate": "COMPILES_TO",
            "subject": "CUDA C++",
            "object": "PTX",
            "startByte": 0,
            "endByte": len(source_bytes),
            "exactText": exact_text,
            "extractorVersion": "official-doc-sentence-rule-v1",
            "status": "PROPOSED",
        },
        source_bytes=source_bytes,
        oak_suggest_fn=lambda term: suggestions[term],
    )
    assert result["accepted"] is True
    assert result["proposal"]["mappingStatus"] == "OAK_ENDPOINTS_SUGGESTED_PENDING_REVIEW"
    assert result["proposal"]["subjectOakSuggestions"] == suggestions["CUDA C++"]
    assert result["proposal"]["objectOakSuggestions"] == suggestions["PTX"]
    assert result["proposal"]["predicate"] == "COMPILES_TO"
    assert result["proposal"]["status"] == "PROPOSED"
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False


def test_oak_empty_match_does_not_count_as_resolved_endpoint():
    source_bytes = b"CUDA C++ device code to PTX."
    result = verify_relation_proposal_v1(
        {
            "chunkId": "capture:ptx",
            "sourceRef": "https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/cuda-platform.html",
            "sourceRevision": SRC_REV,
            "contentSha256": CONTENT_SHA,
            "chunkSha256": hashlib.sha256(source_bytes).hexdigest(),
            "predicate": "COMPILES_TO",
            "subject": "CUDA C++",
            "object": "PTX",
            "startByte": 0,
            "endByte": len(source_bytes),
            "exactText": source_bytes.decode(),
            "extractorVersion": "test-v1",
            "status": "PROPOSED",
        },
        source_bytes=source_bytes,
        oak_suggest_fn=lambda term: (
            [{"conceptId": "ATLASLANG:cuda_cpp"}]
            if term == "CUDA C++"
            else [{"matches": [{"searchText": "PTX", "externalIds": []}], "candidateBundle": {"concepts": []}}]
        ),
    )
    assert result["accepted"] is True
    assert result["proposal"]["mappingStatus"] == "PARTIAL_OAK_SUGGESTIONS"
    assert result["proposal"]["objectOakSuggestions"][0]["candidateBundle"]["concepts"] == []


def test_batch_source_readback_rehashes_parent_and_emits_full_file_offsets():
    parent_bytes = b"header\nimport x from './x';\nfooter\n"
    chunk_bytes = b"import x from './x';"
    chunk = {
        "chunkId": "c5", "sourceRef": "src/c.ts", "sourceRevision": SRC_REV,
        "contentSha256": hashlib.sha256(parent_bytes).hexdigest(),
        "chunkSha256": hashlib.sha256(chunk_bytes).hexdigest(), "text": chunk_bytes.decode(),
    }
    verified = extract_and_verify_import_proposals_from_chunks_v1(
        [chunk], source_readback_fn=lambda _ref: parent_bytes, require_source_readback=True,
    )
    assert verified["verifiedCount"] == 1
    assert verified["sourceReadbackRequired"] is True
    assert verified["sourceContentHashVerifiedCount"] == 1
    proposal = verified["proposals"][0]
    assert proposal["startByte"] == parent_bytes.index(b"import")
    assert proposal["sourceContentHashStatus"] == "REHASHED_MATCH"

    stale = extract_and_verify_import_proposals_from_chunks_v1(
        [chunk], source_readback_fn=lambda _ref: b"changed\n" + parent_bytes, require_source_readback=True,
    )
    assert stale["verifiedCount"] == 0
    assert stale["rejected"][0]["failure"] == "SOURCE_CONTENT_SHA256_MISMATCH"
