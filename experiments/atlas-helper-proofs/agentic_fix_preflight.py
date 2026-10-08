"""Read-only agentic repair preflight. No shell, network, DB or source mutation."""
import hashlib
import json
from pathlib import Path

OWNERS = {
  "error_runner":"scripts/atlas/run-agentic-error-fixing-v1.mjs",
  "error_taxonomy":"scripts/atlas/agentic-error-domain-ontology.mjs",
  "error_readiness":"scripts/atlas/audit-nlp-agentic-error-readiness-v1.mjs",
  "symbol_repository":"packages/parent-atlas/src/core/symbol-registry-repository.ts",
  "symbol_canary":"scripts/atlas/audit-current-tree-bound-symbol-registry-input-v1.mjs",
  "okf_schema":"docs/.okf/schema.yaml",
  "okf_owner":"scripts/atlas/audit-okf-runtime-ownership.mjs",
  "ts_morph_reference":"docs/.okf/ts-morph/raw/ts-morph.com.md",
  "python_sidecar":"python/miniforge_nlp_sidecar.py",
  "context_owner":"packages/parent-atlas/src/core/oak-context-manifest-owner-v1.ts",
}
def discover(repo_root):
    root=Path(repo_root).resolve()
    result={}
    for name,rel in OWNERS.items():
        path=root/rel
        result[name]={"path":rel,"exists":path.is_file()}
        if path.is_file():
            data=path.read_bytes()
            result[name].update({"bytes":len(data),"sha256":"sha256:"+hashlib.sha256(data).hexdigest()})
        else:
            result[name]["todo"]="TODO: locate actual owner; do not create duplicate registry or runtime"
    return {"schema":"atlas.agentic-fix-owner-discovery.v1","owners":result,
            "ready_for_patch":False,"production_writes":False}

def validate_request(request):
    required={"request_id","workspace_revision","source_ref","source_revision",
              "error_code","diagnostic","expected_symbol_version_id"}
    if not isinstance(request,dict) or set(request)!=required:
        raise ValueError("INVALID_DIAGNOSTIC_SCHEMA")
    if any(not isinstance(x,str) or not x.strip() or len(x)>4096 for x in request.values()):
        raise ValueError("INVALID_DIAGNOSTIC_FIELD")
    return {"status":"NEEDS_AUTHORIZED_SOURCE_MEMBERSHIP",
            "request_id":request["request_id"],"source_ref":request["source_ref"],
            "expected_symbol_version_id":request["expected_symbol_version_id"],
            "write_allowed":False,"todo":[
                "TODO: inspect existing source execution + AST/CST coordinates with revision-qualified membership",
                "TODO: run ts-morph/ast-grep/Tree-sitter owner-specific probes without modifying source",
                "TODO: match exact symbol_version_id in existing Postgres registry; fail on absent or ambiguous mapping",
                "TODO: derive allowed action via OpenSpec EvidenceCard + approval receipt, not ML/HMM prediction",
                "TODO: propose patch, run targeted tests in authorized sandbox, independent readback",
                "TODO: append immutable attempt outcome incl. supersession; do not rewrite prior attempt",
            ]}

def main():
    import argparse
    p=argparse.ArgumentParser()
    p.add_argument("--repo-root",default="../..")
    p.add_argument("--request-json",help="Optional bounded JSON diagnostic file")
    args=p.parse_args()
    report=discover(args.repo_root)
    if args.request_json:
        path=Path(args.request_json)
        if not path.is_file() or path.stat().st_size>16_384:
            raise ValueError("INVALID_REQUEST_SIZE")
        report["diagnostic"]=validate_request(json.loads(path.read_text(encoding="utf-8")))
    print(json.dumps(report,sort_keys=True,indent=2))
if __name__=="__main__":
    main()
