#!/usr/bin/env python3
"""
Production TensorRT-LLM Legal AI Server
32k context legal document processing with FastAPI
"""

import os
import sys
import asyncio
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
import json

# FastAPI and server components
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Ollama client for production inference
import httpx

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
OLLAMA_BASE_URL = "http://localhost:11434"
MODEL_NAME = "gemma3-legal:latest"
MAX_CONTEXT_LENGTH = 32768
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 512

class LegalAnalysisRequest(BaseModel):
    document: str
    analysis_type: str = "summary"  # summary, obligations, risks, compliance
    max_tokens: int = DEFAULT_MAX_TOKENS
    temperature: float = DEFAULT_TEMPERATURE

class LegalGenerationRequest(BaseModel):
    prompt: str
    max_tokens: int = DEFAULT_MAX_TOKENS
    temperature: float = DEFAULT_TEMPERATURE
    stream: bool = False

class LegalAnalysisResponse(BaseModel):
    analysis: str
    analysis_type: str
    document_length: int
    processing_time: float
    model: str

class ProductionLegalAI:
    """Production Legal AI using Ollama with Gemma3 32k context"""

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=60.0)
        self.model_name = MODEL_NAME
        self.base_url = OLLAMA_BASE_URL
        self._verify_model()

    def _verify_model(self):
        """Verify that the Gemma3 legal model is available"""
        try:
            import subprocess
            result = subprocess.run(['ollama', 'list'], capture_output=True, text=True)
            if self.model_name not in result.stdout:
                raise ValueError(f"Model {self.model_name} not found in Ollama")
            logger.info(f"✅ Model {self.model_name} verified and ready")
        except Exception as e:
            logger.error(f"Model verification failed: {e}")
            raise

    async def generate(self, prompt: str, max_tokens: int = DEFAULT_MAX_TOKENS,
                      temperature: float = DEFAULT_TEMPERATURE, **kwargs) -> str:
        """Generate text using Ollama with 32k context"""
        try:
            start_time = datetime.now()

            payload = {
                "model": self.model_name,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_ctx": MAX_CONTEXT_LENGTH,
                    "num_predict": max_tokens,
                    "temperature": temperature,
                    "stop": ["<end_of_turn>"],
                    **kwargs
                }
            }

            response = await self.client.post(
                f"{self.base_url}/api/generate",
                json=payload
            )
            response.raise_for_status()

            result = response.json()
            end_time = datetime.now()
            processing_time = (end_time - start_time).total_seconds()

            logger.info(f"Generated {max_tokens} max tokens in {processing_time:.2f}s")
            return result.get("response", "")

        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    async def analyze_legal_document(self, document: str, analysis_type: str = "summary",
                                   max_tokens: int = DEFAULT_MAX_TOKENS) -> Dict[str, Any]:
        """Specialized legal document analysis with 32k context"""

        analysis_prompts = {
            "summary": f"""As a specialized legal AI, provide a comprehensive summary of this legal document. Include:
1. Document type and purpose
2. Key parties involved
3. Main obligations and rights
4. Important dates and deadlines
5. Critical terms and conditions

Document:
{document}

Provide a clear, professional summary:""",

            "obligations": f"""Analyze this legal document and identify all legal obligations and responsibilities. For each obligation, specify:
1. Who has the obligation (which party)
2. What must be done
3. When it must be done (deadlines)
4. Consequences of non-compliance

Document:
{document}

Legal obligations analysis:""",

            "risks": f"""Conduct a legal risk assessment of this document. Identify:
1. Potential legal liabilities
2. Regulatory compliance risks
3. Financial exposure risks
4. Operational risks
5. Recommended risk mitigation strategies

Document:
{document}

Risk assessment:""",

            "compliance": f"""Review this document for regulatory compliance issues. Check for:
1. Applicable regulations and statutes
2. Required disclosures
3. Compliance gaps or violations
4. Recommended corrective actions
5. Regulatory filing requirements

Document:
{document}

Compliance analysis:"""
        }

        if analysis_type not in analysis_prompts:
            raise HTTPException(status_code=400, detail=f"Invalid analysis type: {analysis_type}")

        prompt = analysis_prompts[analysis_type]

        start_time = datetime.now()
        analysis = await self.generate(prompt, max_tokens)
        end_time = datetime.now()

        return {
            "analysis": analysis,
            "analysis_type": analysis_type,
            "document_length": len(document),
            "processing_time": (end_time - start_time).total_seconds(),
            "model": self.model_name
        }

# Create FastAPI app
app = FastAPI(
    title="Legal AI TensorRT Server",
    description="Production 32k context legal document processing",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize AI instance
ai = ProductionLegalAI()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model": MODEL_NAME,
        "max_context": MAX_CONTEXT_LENGTH,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/legal/analyze", response_model=LegalAnalysisResponse)
async def analyze_legal_document(request: LegalAnalysisRequest):
    """Analyze legal documents with 32k context"""
    try:
        result = await ai.analyze_legal_document(
            request.document,
            request.analysis_type,
            request.max_tokens
        )
        return LegalAnalysisResponse(**result)
    except Exception as e:
        logger.error(f"Legal analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate")
async def generate_text(request: LegalGenerationRequest):
    """Generate text with legal AI model"""
    try:
        result = await ai.generate(
            request.prompt,
            request.max_tokens,
            request.temperature
        )
        return {
            "response": result,
            "model": MODEL_NAME,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Text generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/model/info")
async def model_info():
    """Get model information"""
    return {
        "model_name": MODEL_NAME,
        "max_context_length": MAX_CONTEXT_LENGTH,
        "capabilities": [
            "32k context legal document analysis",
            "Contract review and summarization",
            "Legal risk assessment",
            "Regulatory compliance checking",
            "Legal obligation identification"
        ]
    }

if __name__ == "__main__":
    print("Starting Legal AI TensorRT Server...")
    print(f"Model: {MODEL_NAME}")
    print(f"Context: {MAX_CONTEXT_LENGTH:,} tokens")
    print(f"Server: http://localhost:8000")
    print(f"Health: http://localhost:8000/health")
    print(f"Docs: http://localhost:8000/docs")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )