"""Private stdin bridge for a server-owned official-document readback."""
import json
from pathlib import Path
import sys
import urllib.request

repo_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo_root))
sys.path.insert(0, str(repo_root / "python"))

from atlas_graph_runtime.dspy_predict_ace_recommender_v1 import (  # noqa: E402
    resolve_live_model_id_v1,
    run_dspy_predict_ace_recommender_v1,
)

MAX_INPUT_BYTES = 384 * 1024


def main() -> None:
    raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("DOC14_INPUT_TOO_LARGE")
    payload = json.loads(raw)
    manifest = payload["manifest"]
    rows = payload["rows"]
    base_url = sys.argv[1].rstrip("/").removesuffix("/v1")

    def readback(checksum: str):
        return (manifest, rows) if checksum == manifest["identityChecksum"] else None

    def count_tokens(content: str) -> int:
        request = urllib.request.Request(
            f"{base_url}/tokenize",
            data=json.dumps({"content": content, "add_special": False}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            tokens = json.loads(response.read(256 * 1024))["tokens"]
        if not isinstance(tokens, list):
            raise ValueError("DOC14_TOKENIZER_RESPONSE_INVALID")
        return len(tokens)

    result = run_dspy_predict_ace_recommender_v1(
        task_query=manifest["v1"]["query"],
        context_manifest=manifest,
        scoped_readback=readback,
        token_counter=count_tokens,
        model_revision=resolve_live_model_id_v1(base_url=base_url),
        program_revision="atlas.doc14-dspy-predict-ace.v2",
        base_url=base_url,
    )
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"bridgeFailure": type(error).__name__}))
