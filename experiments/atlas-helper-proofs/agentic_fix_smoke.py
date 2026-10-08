"""Safe smoke runner for exact source span + external membership snapshot."""
import argparse
import json
from pathlib import Path
from hashlib import sha256
from agentic_fix_membership_gate import verify_membership,load_snapshot
from agentic_fix_pipeline import propose_repair

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--source",required=True)
    p.add_argument("--source-ref",required=True)
    p.add_argument("--workspace-revision",required=True)
    p.add_argument("--start-byte",type=int,required=True)
    p.add_argument("--end-byte",type=int,required=True)
    p.add_argument("--membership-json",required=True)
    p.add_argument("--diagnostic",required=True)
    args=p.parse_args()
    path=Path(args.source)
    if not path.is_file() or path.stat().st_size>2_000_000:
        raise ValueError("INVALID_SOURCE_FILE")
    source=path.read_bytes()
    revision="sha256:"+sha256(source).hexdigest()
    plan=propose_repair(args.diagnostic,source,args.source_ref,revision)
    membership=verify_membership(source,args.source_ref,args.workspace_revision,
                args.start_byte,args.end_byte,load_snapshot(Path(args.membership_json)))
    print(json.dumps({"schema":"atlas.agentic-repair-smoke.v1",
                      "plan_digest":plan["receipt_sha256"],
                      "membership":membership,
                      "can_mutate":False,
                      "status":"PROPOSAL_ONLY",
                      "todo":"TODO: live source execution, AST parser parity, admission and trusted caller required"},
                     sort_keys=True,indent=2))
if __name__=="__main__": main()
