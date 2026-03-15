#!/usr/bin/env python3
"""
LangExtract Ollama Service — Direct Ollama API for structured extraction
Uses gemma3-legal for legal entity extraction with few-shot prompting
"""

import os
import json
import hashlib
import httpx
from pathlib import Path
from typing import Optional, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# Configuration
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL = os.getenv("LANGEXTRACT_MODEL", "gemma3-legal:latest")

app = FastAPI(
    title="LangExtract Ollama Service",
    description="Structured extraction using Ollama + gemma3-legal",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Extraction cache (in-memory)
_cache: dict[str, Any] = {}


# ─────────────────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────────────────

LEGAL_PROMPT = """You are a legal document analyst. Extract structured information from the text.

Output JSON array with objects containing:
- type: entity type (PARTY, DATE, CITATION, MONEY, STATUTE, LOCATION, OBLIGATION)
- text: exact text from document
- attributes: relevant metadata object

Example input: "On January 15, 2024, ACME Corp filed suit in California Superior Court seeking $500,000 under Cal. Civ. Code § 3294."

Example output:
[
  {{"type": "DATE", "text": "January 15, 2024", "attributes": {{"kind": "filing_date"}}}},
  {{"type": "PARTY", "text": "ACME Corp", "attributes": {{"role": "plaintiff", "entity_type": "corporation"}}}},
  {{"type": "LOCATION", "text": "California Superior Court", "attributes": {{"kind": "court"}}}},
  {{"type": "MONEY", "text": "$500,000", "attributes": {{"kind": "damages"}}}},
  {{"type": "STATUTE", "text": "Cal. Civ. Code § 3294", "attributes": {{"jurisdiction": "California"}}}}
]

Now extract from this text:
{text}

Output only valid JSON array:"""

EVIDENCE_PROMPT = """You are a forensic analyst. Extract evidence-related entities from the text.

Output JSON array with objects containing:
- type: entity type (PERSON, DATE, LOCATION, PHONE, EMAIL, IDENTIFIER, QUOTE, DOCUMENT)
- text: exact text from document
- attributes: relevant metadata object

Example input: 'Officer Badge #4521 responded to 123 Main St at 2:45 PM. Witness Jane Doe stated "I saw a blue sedan."'

Example output:
[
  {{"type": "IDENTIFIER", "text": "Badge #4521", "attributes": {{"kind": "badge_number"}}}},
  {{"type": "LOCATION", "text": "123 Main St", "attributes": {{"kind": "address"}}}},
  {{"type": "DATE", "text": "2:45 PM", "attributes": {{"kind": "time"}}}},
  {{"type": "PERSON", "text": "Jane Doe", "attributes": {{"role": "witness"}}}},
  {{"type": "QUOTE", "text": "I saw a blue sedan", "attributes": {{"speaker": "Jane Doe"}}}}
]

Now extract from this text:
{text}

Output only valid JSON array:"""


# ─────────────────────────────────────────────────────────────────────────────
# Request/Response Models
# ─────────────────────────────────────────────────────────────────────────────

class ExtractionRequest(BaseModel):
    text: str = Field(..., description="Text to extract from")
    extraction_type: str = Field(default="legal", description="Type: 'legal', 'evidence', 'custom'")
    custom_prompt: Optional[str] = Field(default=None, description="Custom prompt template (use {text} placeholder)")
    model_id: str = Field(default=DEFAULT_MODEL)
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    use_cache: bool = Field(default=True, description="Enable response caching")


class Extraction(BaseModel):
    type: str
    text: str
    attributes: dict = {}


class ExtractionResponse(BaseModel):
    document_id: str
    total_extractions: int
    extractions: list[Extraction]
    cached: bool = False
    metadata: dict


class FileExtractionRequest(BaseModel):
    file_path: str = Field(..., description="Path to local file or URL")
    extraction_type: str = Field(default="legal")
    model_id: str = Field(default=DEFAULT_MODEL)
    use_cache: bool = Field(default=True)


class HealthResponse(BaseModel):
    status: str
    service: str
    model: str
    ollama_url: str
    cache_size: int
    flash_attention: bool = True  # Ollama uses FlashAttention2 on supported GPUs


# ─────────────────────────────────────────────────────────────────────────────
# Core Logic
# ─────────────────────────────────────────────────────────────────────────────

async def call_ollama(prompt: str, model: str = DEFAULT_MODEL, temperature: float = 0.2) -> str:
    """Call Ollama API with the given prompt (async via httpx)."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "keep_alive": "24h",
                "options": {
                    "temperature": temperature,
                    "num_predict": 2048,
                },
                "format": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {"type": "string"},
                            "text": {"type": "string"},
                            "attributes": {"type": "object"}
                        },
                        "required": ["type", "text"]
                    }
                }
            }
        )
        response.raise_for_status()
        return response.json().get("response", "")


def parse_json_response(response: str) -> list[dict]:
    """Extract JSON array from LLM response."""
    # Try direct parse first
    try:
        result = json.loads(response.strip())
        if isinstance(result, list):
            return result
        return [result] if isinstance(result, dict) else []
    except json.JSONDecodeError:
        pass

    # Try to find JSON array in response
    import re
    match = re.search(r'\[[\s\S]*\]', response)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return []


async def extract_entities(
    text: str,
    extraction_type: str = "legal",
    custom_prompt: Optional[str] = None,
    model: str = DEFAULT_MODEL,
    temperature: float = 0.2,
    use_cache: bool = True
) -> dict:
    """Run extraction using Ollama."""

    # Check cache
    cache_key = hashlib.md5(f"{text[:500]}:{extraction_type}:{model}".encode()).hexdigest()
    if use_cache and cache_key in _cache:
        cached = _cache[cache_key]
        return {**cached, "cached": True}

    # Select prompt
    if extraction_type == "legal":
        prompt = LEGAL_PROMPT.format(text=text[:4000])  # Limit input
    elif extraction_type == "evidence":
        prompt = EVIDENCE_PROMPT.format(text=text[:4000])
    elif extraction_type == "custom" and custom_prompt:
        prompt = custom_prompt.format(text=text[:4000])
    else:
        raise ValueError(f"Unknown extraction_type: {extraction_type}")

    # Call Ollama
    try:
        response = await call_ollama(prompt, model, temperature)
        extractions = parse_json_response(response)
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "extractions": [],
            "cached": False
        }

    result = {
        "success": True,
        "extractions": extractions,
        "cached": False,
        "metadata": {
            "model": model,
            "temperature": temperature,
            "extraction_type": extraction_type
        }
    }

    # Cache result
    if use_cache:
        _cache[cache_key] = result

    return result


# ─────────────────────────────────────────────────────────────────────────────
# API Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check with FlashAttention2 status."""
    return HealthResponse(
        status="healthy",
        service="langextract-ollama",
        model=DEFAULT_MODEL,
        ollama_url=OLLAMA_URL,
        cache_size=len(_cache),
        flash_attention=True  # Ollama uses FA2 on RTX 3060+
    )


@app.post("/extract", response_model=ExtractionResponse)
async def extract(request: ExtractionRequest):
    """Extract structured information from text."""

    result = await extract_entities(
        text=request.text,
        extraction_type=request.extraction_type,
        custom_prompt=request.custom_prompt,
        model=request.model_id,
        temperature=request.temperature,
        use_cache=request.use_cache
    )

    if not result.get("success", False):
        raise HTTPException(500, f"Extraction failed: {result.get('error')}")

    doc_id = hashlib.md5(request.text[:100].encode()).hexdigest()[:12]

    return ExtractionResponse(
        document_id=doc_id,
        total_extractions=len(result["extractions"]),
        extractions=[Extraction(**e) for e in result["extractions"]],
        cached=result.get("cached", False),
        metadata=result.get("metadata", {})
    )


@app.post("/extract/file")
async def extract_file(request: FileExtractionRequest):
    """Extract from file path or URL."""

    file_path = request.file_path

    # Handle URLs
    if file_path.startswith(("http://", "https://")):
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(file_path)
            response.raise_for_status()
            text = response.text
    else:
        # Read local file
        path = Path(file_path)
        if not path.exists():
            raise HTTPException(404, f"File not found: {file_path}")

        # PDF support
        if path.suffix.lower() == ".pdf":
            try:
                import pdfplumber
                with pdfplumber.open(path) as pdf:
                    text = "\n".join(page.extract_text() or "" for page in pdf.pages)
            except ImportError:
                raise HTTPException(500, "pdfplumber not installed for PDF support")
        else:
            text = path.read_text(encoding="utf-8", errors="ignore")

    result = await extract_entities(
        text=text,
        extraction_type=request.extraction_type,
        model=request.model_id,
        use_cache=request.use_cache
    )

    if not result.get("success", False):
        raise HTTPException(500, f"Extraction failed: {result.get('error')}")

    return {
        "file": file_path,
        "total_extractions": len(result["extractions"]),
        "extractions": result["extractions"],
        "cached": result.get("cached", False),
        "metadata": result.get("metadata", {})
    }


@app.delete("/cache")
async def clear_cache():
    """Clear extraction cache."""
    count = len(_cache)
    _cache.clear()
    return {"cleared": count}


@app.get("/cache/stats")
async def cache_stats():
    """Get cache statistics."""
    return {
        "entries": len(_cache),
        "keys": list(_cache.keys())[:20]  # First 20 keys
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8095)
