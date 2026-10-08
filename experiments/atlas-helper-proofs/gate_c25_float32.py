"""C25-01: compare Python vs original TS runtime JSON results as raw float32 bits."""
import json
import struct
import subprocess
from pathlib import Path
from cpu_parity_cli import matrix_object

HERE=Path(__file__).resolve().parent
def bits32(v):
    return struct.pack("<f", v).hex()

def compare(py,ts):
    for key in ("candidate_packet_keys","candidate_count","feature_count","presence_mask"):
        if py[key]!=ts[key]:
            raise ValueError("C25_MISMATCH:"+key)
    a,b=py["candidate_features"],ts["candidate_features"]
    if len(a)!=len(b) or len(a)!=py["candidate_count"]*25:
        raise ValueError("C25_WIDTH_MISMATCH")
    mismatches=[i for i,(x,y) in enumerate(zip(a,b)) if bits32(x)!=bits32(y)]
    if mismatches:
        raise ValueError("C25_FLOAT32_MISMATCH:"+str(mismatches[:10]))
    return {"status":"PARITY_PASS","rows":py["candidate_count"],"feature_count":25}

def run():
    fixture=json.loads((HERE/"c25-parity-fixture.json").read_text())
    py=matrix_object(fixture)
    proc=subprocess.run(["npx","tsx",str(HERE/"c25-parity-existing-owner.mts")],
                        cwd=HERE.parents[1]/"sveltekit-frontend",
                        text=True,capture_output=True,check=True,timeout=45)
    return compare(py,json.loads(proc.stdout))
if __name__=="__main__":
    print(json.dumps(run()))
