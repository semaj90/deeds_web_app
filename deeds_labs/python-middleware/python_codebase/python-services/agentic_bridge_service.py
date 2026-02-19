# Phase 68 - Agentic Function-Calling + Semantic Grounding
from fastapi import FastAPI, Request
import importlib, json, asyncio, os
from pydantic import BaseModel
import redis
import traceback
from datetime import datetime

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
    args: dict

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
            result = await func(**call.args)
        else:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, lambda: func(**call.args))

        redis_client.xadd("agentic:invocations", {
            "fn": call.name,
            "args": json.dumps(call.args),
            "timestamp": datetime.utcnow().isoformat()
        })

        return {"ok": True, "result": result}
    except Exception:
        return {"ok": False, "error": traceback.format_exc()}
