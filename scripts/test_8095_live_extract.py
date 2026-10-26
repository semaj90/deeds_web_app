import urllib.request
import json
import sys

def main():
    try:
        health_req = urllib.request.Request("http://127.0.0.1:8095/health")
        with urllib.request.urlopen(health_req, timeout=3) as resp:
            health = json.loads(resp.read().decode('utf-8'))
            print("HEALTH:", health)
    except Exception as e:
        print("Health failed:", e)
        return

    sample_ts = """
export const TURBOVEC_INDEX_DIMENSION = 128;

export function computeBitset128(values: number[]): string {
    return "0x" + values.length.toString(16);
}
"""
    payload = {
        "text": sample_ts,
        "language": "typescript"
    }
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:8095/extract",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print("EXTRACT KEYS:", list(res.keys()))
            if "structure" in res:
                print("STRUCTURE KEYS:", list(res["structure"].keys()))
                chunks = res["structure"].get("chunks", [])
                print(f"FOUND {len(chunks)} CHUNKS")
                for c in chunks:
                    print("CHUNK:", c.get("symbol"), c.get("kind"), c.get("start_byte"), c.get("end_byte"))
            else:
                print("RESPONSE FULL:", json.dumps(res, indent=2)[:500])
    except Exception as e:
        print("Extract failed:", e)

if __name__ == "__main__":
    main()
