# Phase 68 - Agentic Function-Calling + Semantic Grounding
from fastapi import FastAPI, Request
import importlib, json, asyncio, os, sys
from pydantic import BaseModel
import redis
import traceback
from datetime import datetime

# Add the project root to Python path so we can import python_codebase modules
project_root = os.path.join(os.path.dirname(__file__), '..', '..')
sys.path.insert(0, project_root)

app = FastAPI(title="Agentic Bridge Service")
redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))

UTIL_PATHS = {
    "ocr_tesseract": "python_codebase.utilities.ocr_tesseract",
    "safe_crawl": "python_codebase.utilities.phase46_safe_crawl",
    "web_parse": "python_codebase.utilities.simd_parser_service",
    "graph_analyze": "python_codebase.utilities.phase47_graph_analyzer",
    "summarize_embed": "python_codebase.model_tools.summarize_and_embed",
}

class FunctionCall(BaseModel):
    name: str
    args: dict | list

@app.post("/invoke")
async def invoke(request: Request):
    try:
        payload = await request.json()
        call = FunctionCall(**payload)
        module_name = UTIL_PATHS.get(call.name)
        if not module_name:
            return {"ok": False, "error": f"Unknown function {call.name}"}

        # Dynamically import the module from the python_codebase
        mod = importlib.import_module(module_name)

        if not hasattr(mod, "main"):
            return {"ok": False, "error": f"Module {call.name} has no main()"}
        func = getattr(mod, "main")

        if asyncio.iscoroutinefunction(func):
            # For async functions, pass args as keyword arguments
            result = await func(**call.args)
        else:
            # For sync functions (utilities), simulate command line args
            import sys as sys_mod
            original_argv = sys_mod.argv
            try:
                # Simulate sys.argv with the script name and arguments
                if isinstance(call.args, list):
                    sys_mod.argv = [f"{call.name}.py"] + call.args
                elif isinstance(call.args, dict):
                    # If dict, assume single positional arg
                    arg_value = list(call.args.values())[0] if call.args else ""
                    sys_mod.argv = [f"{call.name}.py", str(arg_value)]
                else:
                    sys_mod.argv = [f"{call.name}.py", str(call.args)]

                # Capture stdout
                import io
                from contextlib import redirect_stdout
                f = io.StringIO()
                with redirect_stdout(f):
                    result = func()
                output = f.getvalue().strip()

                # Try to parse as JSON, otherwise return as string
                try:
                    result = json.loads(output)
                except:
                    result = output

            finally:
                sys_mod.argv = original_argv

        try:
            redis_client.xadd("agentic:invocations", {
                "fn": call.name,
                "args": json.dumps(call.args),
                "timestamp": datetime.utcnow().isoformat()
            })
        except Exception:
            # Redis logging is optional - don't fail if Redis is unavailable
            pass

        return {"ok": True, "result": result}
    except Exception:
        return {"ok": False, "error": traceback.format_exc()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8099)
