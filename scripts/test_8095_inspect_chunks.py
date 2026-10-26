import urllib.request
import json

sample_ts = """
export const TURBOVEC_INDEX_DIMENSION = 128;

export function computeBitset128(values: number[]): string {
    return "0x" + values.length.toString(16);
}
"""
payload = {"text": sample_ts, "language": "typescript"}
req = urllib.request.Request(
    "http://127.0.0.1:8095/extract",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)
with urllib.request.urlopen(req, timeout=5) as resp:
    res = json.loads(resp.read().decode("utf-8"))
    chunks = res.get("structure", {}).get("chunks", [])
    for idx, c in enumerate(chunks):
        print(f"--- CHUNK {idx} ---")
        print(json.dumps(c, indent=2))
