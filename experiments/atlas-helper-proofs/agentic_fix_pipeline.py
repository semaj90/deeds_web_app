"""Bounded CPU proposal for error fixing, preserving unresolved AST and symbol identity."""
from dataclasses import dataclass
from hashlib import sha256
import json
from cpu_nlp_lut import classify
from cpu_dag import topological_order

@dataclass(frozen=True)
class RepairStage:
    name: str
    depends_on: tuple[str,...]

STAGES=(
    RepairStage("diagnostic",()),
    RepairStage("source_snapshot",("diagnostic",)),
    RepairStage("ast_cst_probe",("source_snapshot",)),
    RepairStage("symbol_registry_join",("ast_cst_probe",)),
    RepairStage("ontology_classification",("symbol_registry_join",)),
    RepairStage("evidence_admission",("ontology_classification",)),
    RepairStage("authorized_patch",("evidence_admission",)),
    RepairStage("targeted_tests",("authorized_patch",)),
    RepairStage("independent_readback",("targeted_tests",)),
    RepairStage("terminal_receipt",("independent_readback",)),
)

def propose_repair(diagnostic, source, source_ref, expected_revision):
    if not isinstance(source,bytes) or len(source)>2_000_000 or not source_ref:
        raise ValueError("INVALID_SOURCE_SNAPSHOT")
    digest="sha256:"+sha256(source).hexdigest()
    if digest!=expected_revision: raise ValueError("STALE_SOURCE_REVISION")
    if not isinstance(diagnostic,str) or not diagnostic.strip() or len(diagnostic)>20_000:
        raise ValueError("INVALID_DIAGNOSTIC")
    order=topological_order([(d,s.name) for s in STAGES for d in s.depends_on],
                            [s.name for s in STAGES])
    domains=[h.domain for h in classify(diagnostic) if h.score>0]
    body={"schema":"atlas.agentic-repair-proposal.v1",
          "source_ref":source_ref,"source_revision":digest,
          "diagnostic_sha256":"sha256:"+sha256(diagnostic.encode()).hexdigest(),
          "stages":order,"domain_hints":domains,"symbol_membership":"UNRESOLVED",
          "ast_cst_parity":"NOT_RUN","okf_taxonomy_revision":"UNRESOLVED",
          "oak_tuple_resolution":"NOT_RUN","approval":"NOT_ADMITTED",
          "can_mutate":False,"has_runtime_caller":False,
          "todo":"TODO: bind existing symbols, source execution, authorized tools and receipt owner before any patch"}
    body["receipt_sha256"]="sha256:"+sha256(json.dumps(body,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    return body
