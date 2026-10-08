"""Safe CPU proof runner: deterministic scratch reports, never canonical admission."""
import argparse
import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def validate(report: Path, real_source: Path | None = None, language: str = "python", kind: str = "function_definition"):
    if not report.resolve().is_relative_to(ROOT.parents[1] / ".tmp"):
        raise ValueError("REPORT_MUST_BE_UNDER_EXPERIMENT_TMP")
    suite = unittest.TestLoader().discover(str(ROOT), pattern="test_*.py")
    result = unittest.TextTestRunner(stream=sys.stderr, verbosity=1).run(suite)
    gates = {"unit_tests": "PASS" if result.wasSuccessful() else "FAIL",
             "unit_tests_run": result.testsRun, "failures": len(result.failures),
             "errors": len(result.errors), "skipped": len(result.skipped),
             "real_parser": "NOT_RUN"}
    if real_source:
        if not real_source.is_file() or real_source.stat().st_size > 2_000_000:
            raise ValueError("INVALID_SOURCE")
        cmd = [sys.executable, str(ROOT / "run_real_ast_alignment.py"),
               "--source", str(real_source), "--ref", real_source.as_posix(),
               "--language", language, "--kind", kind]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=35, check=False)
        if proc.returncode == 0:
            gates["real_parser"] = "PASS"
            gates["parser_result"] = json.loads(proc.stdout)
        else:
            gates["real_parser"] = "FAIL"
            gates["parser_error"] = proc.stderr[-2000:]
    gates["status"] = "PASS" if result.wasSuccessful() and gates["real_parser"] != "FAIL" else "FAIL"
    gates["canonical_authority"] = False
    gates["writes_performed"] = False
    raw = json.dumps(gates, sort_keys=True, separators=(",", ":")).encode()
    gates["receipt_checksum"] = "sha256:" + hashlib.sha256(raw).hexdigest()
    report.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents overwriting a previous proof.
    with report.open("x", encoding="utf-8") as target:
        json.dump(gates, target, sort_keys=True, indent=2)
        target.write("\n")
    observed = json.loads(report.read_text())
    checksum = observed.pop("receipt_checksum")
    if "sha256:" + hashlib.sha256(json.dumps(observed,sort_keys=True,separators=(",", ":")).encode()).hexdigest() != checksum:
        raise ValueError("RECEIPT_READBACK_MISMATCH")
    return gates

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--report", required=True)
    p.add_argument("--source")
    p.add_argument("--language", default="python")
    p.add_argument("--kind", default="function_definition")
    args = p.parse_args()
    response = validate(Path(args.report), Path(args.source) if args.source else None,
                        args.language, args.kind)
    print(json.dumps({"status":response["status"],"receipt":args.report,
                      "checksum":response["receipt_checksum"]},sort_keys=True))
    sys.exit(0 if response["status"]=="PASS" else 1)
