from fastapi import FastAPI, Request
import orjson, numpy as np, torch, cupy as cp
import sys
import json

app = FastAPI()

@app.post("/json")
async def parse_json(req: Request):
    data = await req.body()
    try:
        parsed = orjson.loads(data)
        arr = np.frombuffer(orjson.dumps(parsed), dtype=np.uint8)
        gpu_tensor = torch.as_tensor(cp.asarray(arr), device="cuda")
        return {
            "ok": True,
            "length": len(arr),
            "gpu_bytes": gpu_tensor.numel(),
            "summary": f"{len(parsed)} top-level entries" if isinstance(parsed, dict) else "array"
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}

def main():
    """Command-line interface for SIMD JSON parsing"""
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python simd_parser_service.py <json_string>"}))
        sys.exit(1)

    json_input = sys.argv[1]

    try:
        # Parse JSON using orjson (SIMD-accelerated)
        parsed = orjson.loads(json_input)

        # Convert to numpy array for GPU processing
        arr = np.frombuffer(orjson.dumps(parsed), dtype=np.uint8)

        # Try GPU acceleration if available
        try:
            gpu_tensor = torch.as_tensor(cp.asarray(arr), device="cuda")
            result = {
                "ok": True,
                "data": parsed,
                "length": len(arr),
                "gpu_bytes": gpu_tensor.numel(),
                "summary": f"{len(parsed)} top-level entries" if isinstance(parsed, dict) else "array",
                "backend": "SIMD_GPU"
            }
        except Exception:
            # Fallback to CPU-only processing
            result = {
                "ok": True,
                "data": parsed,
                "length": len(arr),
                "summary": f"{len(parsed)} top-level entries" if isinstance(parsed, dict) else "array",
                "backend": "SIMD_CPU"
            }

        print(json.dumps(result))

    except Exception as e:
        result = {"ok": False, "error": str(e)}
        print(json.dumps(result))

if __name__ == "__main__":
    main()
