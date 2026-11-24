"""Security regression for the DOC-14 command bridge."""
import json
from pathlib import Path
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "atlas" / "run-doc14-scoped-predict-v1.py"


def test_caller_supplied_rows_never_claim_readback_or_run_inference():
    payload = {
        "manifest": {
            "schema": "atlas.context-manifest.v2",
            "identityChecksum": "a" * 64,
            "v1": {"query": "forged"},
        },
        "rows": [{"chunkId": "caller-forged", "text": "unverified"}],
    }
    proc = subprocess.run(
        [sys.executable, str(SCRIPT)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=REPO_ROOT,
        check=True,
        timeout=5,
    )

    result = json.loads(proc.stdout)
    assert result["status"] == "ACE_VERIFIED_READBACK_TRANSPORT_NOT_CONFIGURED"
    assert result["requestedIdentityChecksum"] == "a" * 64
    assert result["citationVerified"] is False
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False
    assert "recommendation" not in result
