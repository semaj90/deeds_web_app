import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "scripts" / "atlas" / "propose-nvidia-cuda-ptx-relation-v1.py"
SPEC = importlib.util.spec_from_file_location("nvidia_cuda_ptx_proposal", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def test_proposal_binds_utf8_spans_and_keeps_alias_and_admission_review_only():
    html = b"""<html><body><main>
    <p>Parallel Thread Execution
(PTX) virtual instruction set architecture (ISA).</p>
    <p>NVRTC can be used to compile CUDA C++ device code to PTX at runtime.</p>
    </main></body></html>"""

    def suggest(term):
        concepts = []
        if term == "CUDA C++":
            concepts = [{"externalId": "ATLASLANG:cuda_cpp", "label": "CUDA C++"}]
        elif term == "PTX Virtual ISA":
            concepts = [{"externalId": "ATLASISA:ptx", "label": "PTX Virtual ISA"}]
        return [{
            "searchText": term,
            "ontologyRevision": "sha256:" + "a" * 64,
            "candidateBundle": {"concepts": concepts},
        }]

    report = MODULE.build_proposal_v1(
        html,
        MODULE.SOURCE_URL,
        suggest,
        lambda subject_id: {
            "status": "OAK_RELATION_PRESENT_PENDING_CANONICAL_REVIEW",
            "relations": [{"subjectExternalId": subject_id, "predicateExternalId": "compiles_to", "objectExternalId": "ATLASISA:ptx"}],
            "canonicalAuthority": False,
            "writesPerformed": False,
        },
    )
    proposal = report["proposalVerification"]["proposal"]
    term_candidate = report["ontologyReview"]["objectTermResolutionCandidate"]

    assert report["status"] == "PROPOSAL_ONLY"
    assert report["proposalVerification"]["accepted"] is True
    assert proposal["predicate"] == "COMPILES_TO"
    assert proposal["mappingStatus"] == "PARTIAL_OAK_SUGGESTIONS"
    assert term_candidate["candidateConcept"]["externalId"] == "ATLASISA:ptx"
    assert term_candidate["status"] == "SUGGESTED_REQUIRES_HUMAN_REVIEW"
    assert [span["evidenceKey"] for span in term_candidate["evidenceSpans"]] == [
        "acronym_expansion",
        "concept_definition",
    ]
    assert report["ontologyReview"]["ontologyRevision"] == "sha256:" + "a" * 64
    assert report["existingOntologyRelations"]["relations"][0]["predicateExternalId"] == "compiles_to"
    assert report["graphAdmission"] == {"status": "NOT_ADMITTED", "graphRevision": None}
    assert report["ace"] == {"proofUsable": False, "status": "NOT_ELIGIBLE"}
    assert report["canonicalAuthority"] is False
    assert report["writesPerformed"] is False
