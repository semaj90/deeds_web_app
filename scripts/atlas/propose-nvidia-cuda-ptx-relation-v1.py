"""Create a source-bound, review-only CUDA C++ -> PTX relation candidate."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "python"))

from atlas_external_docs import extract_structured_text  # noqa: E402
from atlas_graph_runtime.relation_proposal_verifier_v1 import verify_relation_proposal_v1  # noqa: E402

SOURCE_URL = "https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/cuda-platform.html"
EVIDENCE_SENTENCE = "NVRTC can be used to compile CUDA C++ device code to PTX at runtime."
DEFAULT_OUTPUT = ROOT / "docs" / "reports" / "doc14-nvidia-cuda-ptx-relation-proposal-v1.json"


def build_proposal_v1(raw_html: bytes, resolved_url: str, oak_suggest_fn, oak_relation_inspect_fn=None):
    parsed = urlparse(resolved_url)
    if parsed.scheme != "https" or parsed.hostname != "docs.nvidia.com":
        raise ValueError("SOURCE_HOST_NOT_ALLOWED")

    _title, normalized_text, _links = extract_structured_text(raw_html, base_url=resolved_url)
    source_bytes = normalized_text.encode("utf-8")
    start_char = normalized_text.find(EVIDENCE_SENTENCE)
    if start_char < 0:
        raise ValueError("EXPECTED_OFFICIAL_EVIDENCE_NOT_FOUND")
    end_char = start_char + len(EVIDENCE_SENTENCE)
    start_byte = len(normalized_text[:start_char].encode("utf-8"))
    end_byte = len(normalized_text[:end_char].encode("utf-8"))
    evidence_bytes = source_bytes[start_byte:end_byte]
    raw_sha = hashlib.sha256(raw_html).hexdigest()
    normalized_sha = hashlib.sha256(source_bytes).hexdigest()
    chunk_sha = hashlib.sha256(evidence_bytes).hexdigest()

    candidate = {
        "chunkId": f"external-capture:{normalized_sha[:24]}:cuda-ptx-sentence",
        "sourceRef": resolved_url,
        "sourceRevision": f"sha256:{normalized_sha}",
        "contentSha256": raw_sha,
        "chunkSha256": chunk_sha,
        "predicate": "COMPILES_TO",
        "subject": "CUDA C++",
        "object": "PTX",
        "startByte": start_byte,
        "endByte": end_byte,
        "exactText": EVIDENCE_SENTENCE,
        "extractorVersion": "official-doc-sentence-rule-v1",
        "status": "PROPOSED",
    }
    verified = verify_relation_proposal_v1(
        candidate,
        source_bytes=source_bytes,
        source_content_bytes=raw_html,
        chunk_bytes=evidence_bytes,
        oak_suggest_fn=oak_suggest_fn,
    )
    proposal = verified.get("proposal") or {}
    alias_search = oak_suggest_fn("PTX Virtual ISA")
    alias_concepts = [
        concept
        for item in alias_search
        if isinstance(item, dict)
        for concept in (item.get("candidateBundle", {}).get("concepts", []) if isinstance(item.get("candidateBundle"), dict) else [])
        if isinstance(concept, dict) and concept.get("externalId")
    ]

    def evidence_span(text: str, key: str) -> dict[str, Any]:
        index = normalized_text.find(text)
        if index < 0:
            raise ValueError(f"ONTOLOGY_MAPPING_EVIDENCE_NOT_FOUND:{key}")
        start = len(normalized_text[:index].encode("utf-8"))
        end = start + len(text.encode("utf-8"))
        if source_bytes[start:end].decode("utf-8") != text:
            raise ValueError(f"ONTOLOGY_MAPPING_EVIDENCE_SPAN_INVALID:{key}")
        return {
            "evidenceKey": key,
            "startByte": start,
            "endByte": end,
            "exactText": text,
            "spanSha256": hashlib.sha256(source_bytes[start:end]).hexdigest(),
        }

    object_mapping_candidate = None
    if alias_concepts:
        object_mapping_candidate = {
            "mentionText": "PTX",
            "candidateConcept": alias_concepts[0],
            "searchLabel": "PTX Virtual ISA",
            "status": "SUGGESTED_REQUIRES_HUMAN_REVIEW",
            "evidenceSpans": [
                evidence_span("Parallel Thread Execution\n(PTX)", "acronym_expansion"),
                evidence_span("virtual instruction set architecture (ISA)", "concept_definition"),
            ],
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
    ontology_revisions = sorted({
        str(item.get("ontologyRevision"))
        for endpoint in ("subjectOakSuggestions", "objectOakSuggestions")
        for item in proposal.get(endpoint, [])
        if isinstance(item, dict) and item.get("ontologyRevision")
    } | {
        str(item.get("ontologyRevision")) for item in alias_search
        if isinstance(item, dict) and item.get("ontologyRevision")
    })
    ontology_revision = ontology_revisions[0] if len(ontology_revisions) == 1 else None
    ontology_status = {
        "OAK_ENDPOINTS_SUGGESTED_PENDING_REVIEW": "BOTH_ENDPOINTS_SUGGESTED_PENDING_REVIEW",
        "PARTIAL_OAK_SUGGESTIONS": "PARTIAL_SUGGESTIONS_PENDING_HUMAN_MAPPING",
        "UNRESOLVED": "ONTOLOGY_MAPPING_UNRESOLVED",
    }.get(proposal.get("mappingStatus"), "ONTOLOGY_MAPPING_UNRESOLVED")
    return {
        "schema": "atlas.doc14-relation-review-candidate.v1",
        "status": "PROPOSAL_ONLY" if verified["accepted"] else "REJECTED",
        "proposalVerification": verified,
        "capture": {
            "sourceRef": resolved_url,
            "representation": "BEAUTIFULSOUP_NORMALIZED_HTML_TEXT",
            "rawHtmlSha256": raw_sha,
            "normalizedTextSha256": normalized_sha,
            "normalizedUtf8ByteLength": len(source_bytes),
            "canonicalIndexStatus": "NOT_ADMITTED",
        },
        "ontologyReview": {
            "status": ontology_status,
            "predicateId": "compiles_to",
            "ontologyRevision": ontology_revision,
            "revisionConflict": len(ontology_revisions) > 1,
            "objectTermResolutionCandidate": object_mapping_candidate,
            "reviewerId": None,
            "reviewRevision": None,
        },
        "existingOntologyRelations": (
            oak_relation_inspect_fn("ATLASLANG:cuda_cpp")
            if oak_relation_inspect_fn is not None
            else {"status": "NOT_INSPECTED", "relations": [], "canonicalAuthority": False, "writesPerformed": False}
        ),
        "graphAdmission": {"status": "NOT_ADMITTED", "graphRevision": None},
        "ace": {"proofUsable": False, "status": "NOT_ELIGIBLE"},
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def local_oak_client_v1():
    ontology_root = ROOT / ".okf" / "ontologies"
    ontology_file = "atlas-domain-and-language-terms-v1.obo"
    os.environ["ATLAS_OAKLIB_ONTOLOGY_ROOT"] = str(ontology_root)
    os.environ["ATLAS_OAKLIB_ONTOLOGY_FILE"] = ontology_file
    import miniforge_nlp_sidecar_v2 as sidecar

    def suggest(term: str):
        response = sidecar.oaklib_label_search(
            sidecar.OaklibLabelSearchRequestV1(terms=[term], maxCandidatesPerTerm=8)
        ).model_dump(by_alias=True)
        return [{
            "searchText": term,
            "matches": response["matches"],
            "candidateBundle": response["candidateBundle"],
            "ontologyRevision": response["ontologyRevision"],
            "producerRevision": response["producerRevision"],
            "status": "PROPOSAL_ONLY",
            "canonicalAuthority": False,
            "writesPerformed": False,
        }]

    def inspect_relations(subject_id: str):
        response = sidecar.oaklib_candidates(
            sidecar.OaklibCandidateRequestV1(external_ids=[subject_id])
        ).model_dump(by_alias=True)
        bundle = response.get("candidates", {})
        relations = [
            relation for relation in bundle.get("relations", [])
            if relation.get("subjectExternalId") == subject_id
            and relation.get("predicateExternalId") == "compiles_to"
            and relation.get("objectExternalId") == "ATLASISA:ptx"
        ]
        return {
            "status": "OAK_RELATION_PRESENT_PENDING_CANONICAL_REVIEW" if relations else "OAK_RELATION_NOT_FOUND",
            "ontologyRevision": response.get("ontologyRevision"),
            "producerRevision": response.get("producerRevision"),
            "relations": relations,
            "mappingCandidates": bundle.get("mappingCandidates", []),
            "canonicalAuthority": False,
            "writesPerformed": False,
        }

    return suggest, inspect_relations


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    request = Request(SOURCE_URL, headers={"User-Agent": "Parent-Atlas-DOC14/1.0"})
    with urlopen(request, timeout=20) as response:  # fixed HTTPS host above
        raw_html = response.read(8 * 1024 * 1024 + 1)
        if len(raw_html) > 8 * 1024 * 1024:
            raise ValueError("SOURCE_CAPTURE_TOO_LARGE")
        resolved_url = response.geturl()

    oak_suggest, oak_inspect = local_oak_client_v1()
    report = build_proposal_v1(raw_html, resolved_url, oak_suggest, oak_inspect)
    output = args.output.resolve()
    if ROOT not in output.parents:
        raise ValueError("OUTPUT_PATH_OUTSIDE_REPOSITORY")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "reportPath": str(output),
        "sourceRevision": report["capture"]["normalizedTextSha256"],
        "canonicalIndexStatus": report["capture"]["canonicalIndexStatus"],
        "graphAdmission": report["graphAdmission"],
        "ace": report["ace"],
        "canonicalAuthority": False,
        "writesPerformed": False,
    }))
    return 0 if report["status"] == "PROPOSAL_ONLY" else 1


if __name__ == "__main__":
    raise SystemExit(main())
