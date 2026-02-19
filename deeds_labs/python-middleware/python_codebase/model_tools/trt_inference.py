#!/usr/bin/env python3
"""
TensorRT-LLM Inference Wrapper for RTX 3060 Ti
FP16 + INT4 engines, VRAM-aware, parallel processing
"""

from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import os
import logging
from typing import List, Dict, Any
import time

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==== CONFIG ====
ENGINE_DIR = Path("/home/james/gemma3_engine_trt")
GPU_ID = 0
CPU_THREADS = os.cpu_count() or 4
MAX_SEQ_LEN = 4096

class TensorRTInference:
    """TensorRT-LLM inference with automatic engine selection"""

    def __init__(self):
        self.engines = {}
        self.available_engines = []
        self._check_available_engines()

    def _check_available_engines(self):
        """Check which TensorRT engines are available"""
        for engine_type in ["fp16", "int4"]:
            engine_path = ENGINE_DIR / engine_type / "engine.plan"
            if engine_path.exists():
                self.available_engines.append(engine_type)
                logger.info(f"✅ Found {engine_type} engine: {engine_path}")
            else:
                logger.warning(f"❌ Missing {engine_type} engine: {engine_path}")

    def load_engine(self, engine_type="fp16"):
        """Load TensorRT engine with error handling"""
        if engine_type not in self.available_engines:
            logger.error(f"Engine {engine_type} not available. Available: {self.available_engines}")
            return None

        if engine_type in self.engines:
            return self.engines[engine_type]

        try:
            # Import here to avoid dependency issues if TensorRT not available
            from tensorrt_llm import TRTLlmModel

            engine_path = ENGINE_DIR / engine_type / "engine.plan"
            logger.info(f"Loading {engine_type} engine from {engine_path}")

            engine = TRTLlmModel(str(engine_path), device_id=GPU_ID)
            engine.prepare_kv_cache(batch_size=1, max_seq_len=MAX_SEQ_LEN)

            self.engines[engine_type] = engine
            logger.info(f"✅ {engine_type} engine loaded successfully")
            return engine

        except Exception as e:
            logger.error(f"Failed to load {engine_type} engine: {e}")
            return None

    def generate(self, prompt: str, engine_type="fp16", max_tokens=128, **kwargs):
        """Generate text with specified engine"""
        engine = self.load_engine(engine_type)
        if engine is None:
            return f"Error: Could not load {engine_type} engine"

        try:
            start_time = time.time()

            # Generate with sliding window for long contexts
            result = engine.generate(
                prompt,
                max_new_tokens=max_tokens,
                use_sliding_window=True,
                **kwargs
            )

            end_time = time.time()
            tokens_per_sec = max_tokens / (end_time - start_time)

            logger.info(f"Generated {max_tokens} tokens in {end_time - start_time:.2f}s ({tokens_per_sec:.1f} tok/s)")
            return result

        except Exception as e:
            logger.error(f"Generation failed: {e}")
            return f"Error: Generation failed - {e}"

    def run_parallel_inference(self, prompts: List[str], engine_type="fp16", max_tokens=128):
        """Run parallel inference on multiple prompts"""
        if not prompts:
            return []

        logger.info(f"Processing {len(prompts)} prompts with {engine_type} engine")

        def process_prompt(prompt):
            return self.generate(prompt, engine_type, max_tokens)

        results = []
        with ThreadPoolExecutor(max_workers=min(len(prompts), CPU_THREADS)) as executor:
            futures = [executor.submit(process_prompt, p) for p in prompts]
            for future in futures:
                try:
                    result = future.result(timeout=30)  # 30 second timeout
                    results.append(result)
                except Exception as e:
                    logger.error(f"Parallel processing failed: {e}")
                    results.append(f"Error: {e}")

        return results

    def analyze_legal_document(self, document: str, analysis_type="summary"):
        """Specialized legal document analysis"""
        legal_prompts = {
            "summary": f"Provide a concise legal summary of this document:\n\n{document}",
            "obligations": f"Identify key legal obligations and responsibilities in this document:\n\n{document}",
            "risks": f"Analyze potential legal risks and liabilities in this document:\n\n{document}",
            "compliance": f"Check this document for regulatory compliance issues:\n\n{document}"
        }

        if analysis_type not in legal_prompts:
            return f"Error: Unknown analysis type '{analysis_type}'"

        prompt = legal_prompts[analysis_type]

        # Use INT4 for longer documents to save VRAM
        engine_type = "int4" if len(document) > 4000 else "fp16"

        return self.generate(prompt, engine_type, max_tokens=512)

# ==== FastAPI Integration ====
def create_fastapi_app():
    """Create FastAPI app for serving TensorRT inference"""
    try:
        from fastapi import FastAPI, HTTPException
        from pydantic import BaseModel
        from typing import List, Optional
    except ImportError:
        logger.error("FastAPI not installed. Run: pip install fastapi uvicorn")
        return None

    app = FastAPI(title="TensorRT Legal AI", version="1.0.0")
    inference = TensorRTInference()

    class GenerateRequest(BaseModel):
        prompts: List[str]
        engine_type: Optional[str] = "fp16"
        max_tokens: Optional[int] = 128

    class LegalAnalysisRequest(BaseModel):
        document: str
        analysis_type: Optional[str] = "summary"

    @app.get("/health")
    async def health_check():
        return {
            "status": "healthy",
            "available_engines": inference.available_engines,
            "gpu_id": GPU_ID
        }

    @app.post("/generate")
    async def generate_text(request: GenerateRequest):
        try:
            outputs = inference.run_parallel_inference(
                request.prompts,
                request.engine_type,
                request.max_tokens
            )
            return {"outputs": outputs}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/legal/analyze")
    async def analyze_legal(request: LegalAnalysisRequest):
        try:
            analysis = inference.analyze_legal_document(
                request.document,
                request.analysis_type
            )
            return {"analysis": analysis, "type": request.analysis_type}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return app

# ==== Example Usage ====
if __name__ == "__main__":
    # Test inference
    inference = TensorRTInference()

    # Legal document analysis examples
    test_prompts = [
        "Analyze the legal contract for key obligations.",
        "Summarize the court decision regarding contract breaches.",
        "Identify potential liability issues in this agreement."
    ]

    print("=== TensorRT Legal AI Inference Test ===")
    print(f"Available engines: {inference.available_engines}")
    print()

    for engine_type in inference.available_engines:
        print(f"Testing {engine_type} engine:")
        outputs = inference.run_parallel_inference(test_prompts, engine_type)

        for i, (prompt, output) in enumerate(zip(test_prompts, outputs)):
            print(f"  Prompt {i+1}: {prompt[:50]}...")
            print(f"  Output: {output[:100]}...")
            print()

    # Start FastAPI server if requested
    import sys
    if "--serve" in sys.argv:
        app = create_fastapi_app()
        if app:
            import uvicorn
            uvicorn.run(app, host="0.0.0.0", port=8000)