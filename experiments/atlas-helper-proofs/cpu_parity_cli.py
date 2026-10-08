"""Read-only JSON-line fixture parity runner for source and feature matrices."""
import argparse
import json
from pathlib import Path
from cpu_candidate_matrix import Candidate, build_cpu_candidate_matrix

def matrix_object(payload):
    candidates = [
        Candidate(c["packet_key"],c["source_ref"],c["source_revision"],c["workspace_revision"],c["values"])
        for c in payload["candidates"]
    ]
    matrix=build_cpu_candidate_matrix(candidates)
    return {
        "candidate_packet_keys":list(matrix.packet_keys),
        "candidate_features":[x for row in matrix.features for x in row],
        "presence_mask":[x for row in matrix.mask for x in row],
        "candidate_count":len(matrix.packet_keys),
        "feature_count":25,
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--fixture",required=True)
    args=parser.parse_args()
    path=Path(args.fixture)
    if not path.is_file() or path.stat().st_size > 2_000_000:
        raise ValueError("INVALID_FIXTURE")
    print(json.dumps(matrix_object(json.loads(path.read_text(encoding="utf-8"))),
                     sort_keys=True,separators=(",",":"),allow_nan=False))
if __name__=="__main__":
    main()
