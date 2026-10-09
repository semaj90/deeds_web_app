"""Read-only composition: source snapshot -> optional real parsers -> exact membership -> repair proposal.

No external model calls, patch execution, database access or admission.
"""
from hashlib import sha256
import json
from pathlib import Path
from agentic_fix_membership_gate import load_snapshot, verify_membership
from agentic_fix_pipeline import propose_repair

def probe(source, source_ref, language, workspace_revision, diagnostic, records,
          parser_mode="off", kind="function_definition"):
    if parser_mode not in ("off","real"):
        raise ValueError("INVALID_PARSER_MODE")
    if not isinstance(source,bytes) or len(source)>2_000_000:
        raise ValueError("INVALID_SOURCE")
    revision="sha256:"+sha256(source).hexdigest()
    plan=propose_repair(diagnostic,source,source_ref,revision)
    observations=[]
    parser_state="NOT_RUN"
    if parser_mode=="real":
        from chunker_adapter import chunk_source
        from ast_graph_alignment import ast_grep_observations, align_exact
        chunks=chunk_source(source,source_ref,language)
        ast=ast_grep_observations(source,source_ref,language,kind)
        alignment=align_exact(chunks,ast)
        observations=[{"start_byte":c.start_byte,"end_byte":c.end_byte,
                       "ast_match":item["status"]} for c,item in zip(chunks,alignment)]
        parser_state="EXECUTED"
    # Without parsers, caller supplies no source spans; no symbol membership is inferred.
    matched=[]
    for obs in observations:
        gate=verify_membership(source,source_ref,workspace_revision,
                               obs["start_byte"],obs["end_byte"],records)
        matched.append({"span":obs,"membership_status":gate["status"],
                        "packet_key":gate.get("packet_key") if gate["status"]=="EXACT_SNAPSHOT_MEMBERSHIP" else None})
    return {"schema":"atlas.agentic-fix-e2e-probe.v1",
            "status":"PROPOSAL_ONLY","source_revision":revision,
            "parser_state":parser_state,"observed_count":len(observations),
            "matched":matched,"plan_sha256":plan["receipt_sha256"],
            "can_mutate":False,"canonical_authority":False,
            "todo":[
                "TODO: qualify snapshot from live source execution + symbol registry readback",
                "TODO: verify ast-grep chunk boundary differences without fuzzy identity promotion",
                "TODO: resolve .okf / OaK tuple against admitted ontology revision",
                "TODO: verify approved execution and ContextManifest caller before patch",
            ]}

def main():
    import argparse
    p=argparse.ArgumentParser()
    p.add_argument("--source",required=True)
    p.add_argument("--source-ref",required=True)
    p.add_argument("--language",required=True)
    p.add_argument("--workspace-revision",required=True)
    p.add_argument("--diagnostic",required=True)
    p.add_argument("--membership-json",required=True)
    p.add_argument("--parser-mode",choices=["off","real"],default="off")
    p.add_argument("--kind",default="function_definition")
    args=p.parse_args()
    path=Path(args.source)
    if not path.is_file() or path.stat().st_size>2_000_000:
        raise ValueError("INVALID_SOURCE_FILE")
    result=probe(path.read_bytes(),args.source_ref,args.language,args.workspace_revision,
                 args.diagnostic,load_snapshot(Path(args.membership_json)),args.parser_mode,args.kind)
    print(json.dumps(result,sort_keys=True,indent=2))
if __name__=="__main__":main()
