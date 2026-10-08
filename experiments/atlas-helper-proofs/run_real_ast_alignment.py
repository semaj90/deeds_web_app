"""Opt-in local parser smoke; python run_real_ast_alignment.py --source src/x.py --ref src/x.py --language python --kind function_definition"""
import argparse
import json
from dataclasses import asdict
from pathlib import Path
from chunker_adapter import chunk_source
from ast_graph_alignment import ast_grep_observations,align_exact

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--source",required=True)
    p.add_argument("--ref",required=True)
    p.add_argument("--language",required=True)
    p.add_argument("--kind",required=True)
    args=p.parse_args()
    path=Path(args.source)
    if not path.is_file() or path.stat().st_size>2_000_000:
        raise ValueError("INVALID_SOURCE_FILE")
    source=path.read_bytes()
    chunks=chunk_source(source,args.ref,args.language)
    ast=ast_grep_observations(source,args.ref,args.language,args.kind)
    aligned=align_exact(chunks,ast)
    print(json.dumps({"status":"PROPOSAL_ONLY","source_ref":args.ref,
                      "chunks":len(chunks),"ast_nodes":len(ast),
                      "exact":sum(x["status"]=="EXACT_SYNTAX_SPAN" for x in aligned),
                      "unmatched":sum(x["status"]=="UNMATCHED_AST_SPAN" for x in aligned),
                      "ambiguous":sum(x["status"]=="AMBIGUOUS_AST_SPAN" for x in aligned),
                      "canonical_authority":False,"writes_performed":False},
                     sort_keys=True))
if __name__=="__main__": main()
