#!/usr/bin/env python3
"""
LangExtract Service — Uses Google's official library with local Ollama
Replaces the 1GB Docker container with ~50MB using existing gemma3-legal

Memory comparison:
  - Old: spaCy (500MB) + BERT (400MB) + EasyOCR (100MB) = 1GB
  - New: langextract (5MB) + Ollama (shared, already running) = ~50MB
"""

import os
import json
import textwrap
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# Google's official LangExtract library
try:
    import langextract
    from langextract import data as lx_data
    from langextract import extract
except ImportError:
    raise ImportError("Install langextract: pip install langextract")

# Configuration
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL = os.getenv("LANGEXTRACT_MODEL", "gemma3-legal:latest")

app = FastAPI(
    title="LangExtract Service (Ollama)",
    description="Structured extraction using Google LangExtract + local Ollama",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Legal Document Extraction Prompts (Domain-Specific)
# ─────────────────────────────────────────────────────────────────────────────

LEGAL_EXTRACTION_PROMPT = textwrap.dedent("""\
    Extract legal entities from this document in order of appearance.
    Use exact text for extractions. Do not paraphrase.

    Entity types to extract:
    - PARTY: Named parties, plaintiffs, defendants, corporations
    - DATE: All dates (filing, hearing, effective, etc.)
    - CITATION: Legal citations (case law, statutes, regulations)
    - MONEY: Dollar amounts, damages, settlements
    - STATUTE: Referenced laws, codes, regulations
    - OBLIGATION: Contractual duties, requirements
    - TERM: Legal terminology, defined terms
    - LOCATION: Jurisdictions, courts, addresses
""")

LEGAL_EXAMPLES = [
    lx_data.ExampleData(
        text="On January 15, 2024, Plaintiff ACME Corporation filed suit against Defendant John Smith in the Superior Court of California, seeking $500,000 in damages under Cal. Civ. Code § 3294.",
        extractions=[
            lx_data.Extraction(
                extraction_class="DATE",
                extraction_text="January 15, 2024",
                attributes={"type": "filing_date"}
            ),
            lx_data.Extraction(
                extraction_class="PARTY",
                extraction_text="ACME Corporation",
                attributes={"role": "plaintiff", "type": "corporation"}
            ),
            lx_data.Extraction(
                extraction_class="PARTY",
                extraction_text="John Smith",
                attributes={"role": "defendant", "type": "individual"}
            ),
            lx_data.Extraction(
                extraction_class="LOCATION",
                extraction_text="Superior Court of California",
                attributes={"type": "court"}
            ),
            lx_data.Extraction(
                extraction_class="MONEY",
                extraction_text="$500,000",
                attributes={"type": "damages"}
            ),
            lx_data.Extraction(
                extraction_class="STATUTE",
                extraction_text="Cal. Civ. Code § 3294",
                attributes={"jurisdiction": "California", "type": "civil_code"}
            ),
        ]
    )
]

EVIDENCE_EXTRACTION_PROMPT = textwrap.dedent("""\
    Extract forensic and evidentiary information from this document.
    Use exact text. Identify potential evidence and metadata.

    Entity types:
    - PERSON: Names mentioned (witnesses, suspects, officers)
    - DATE: Dates and timestamps
    - LOCATION: Addresses, GPS coordinates, locations
    - PHONE: Phone numbers
    - EMAIL: Email addresses
    - DOCUMENT: Referenced documents, exhibits
    - IDENTIFIER: Case numbers, badge numbers, IDs
    - QUOTE: Direct quotes, statements
""")

EVIDENCE_EXAMPLES = [
    lx_data.ExampleData(
        text='Officer Badge #4521 responded to 123 Main St at 2:45 PM. Witness Jane Doe stated "I saw a blue sedan leave the scene." Contact: jane.doe@email.com, (555) 123-4567.',
        extractions=[
            lx_data.Extraction(
                extraction_class="IDENTIFIER",
                extraction_text="Badge #4521",
                attributes={"type": "badge_number"}
            ),
            lx_data.Extraction(
                extraction_class="LOCATION",
                extraction_text="123 Main St",
                attributes={"type": "address"}
            ),
            lx_data.Extraction(
                extraction_class="DATE",
                extraction_text="2:45 PM",
                attributes={"type": "time"}
            ),
            lx_data.Extraction(
                extraction_class="PERSON",
                extraction_text="Jane Doe",
                attributes={"role": "witness"}
            ),
            lx_data.Extraction(
                extraction_class="QUOTE",
                extraction_text="I saw a blue sedan leave the scene",
                attributes={"speaker": "Jane Doe"}
            ),
            lx_data.Extraction(
                extraction_class="EMAIL",
                extraction_text="jane.doe@email.com",
                attributes={}
            ),
            lx_data.Extraction(
                extraction_class="PHONE",
                extraction_text="(555) 123-4567",
                attributes={}
            ),
        ]
    )
]


# ─────────────────────────────────────────────────────────────────────────────
# Request/Response Models
# ─────────────────────────────────────────────────────────────────────────────

class ExtractionRequest(BaseModel):
    text: str = Field(..., description="Text to extract from")
    extraction_type: str = Field(
        default="legal",
        description="Type: 'legal', 'evidence', 'custom'"
    )
    custom_prompt: Optional[str] = Field(
        default=None,
        description="Custom extraction prompt (for type='custom')"
    )
    custom_examples: Optional[list] = Field(
        default=None,
        description="Custom few-shot examples"
    )
    model_id: str = Field(default=DEFAULT_MODEL)
    extraction_passes: int = Field(default=1, ge=1, le=5)
    temperature: float = Field(default=0.3, ge=0.0, le=1.0)
    max_workers: int = Field(default=4, ge=1, le=20)


class Extraction(BaseModel):
    extraction_class: str
    extraction_text: str
    attributes: dict
    start_char: Optional[int] = None
    end_char: Optional[int] = None


class ExtractionResponse(BaseModel):
    document_id: str
    total_extractions: int
    extractions: list[Extraction]
    metadata: dict


class FileExtractionRequest(BaseModel):
    file_path: str = Field(..., description="Path to file or URL")
    extraction_type: str = Field(default="legal")
    model_id: str = Field(default=DEFAULT_MODEL)
    extraction_passes: int = Field(default=2)


# ─────────────────────────────────────────────────────────────────────────────
# Core Extraction Logic
# ─────────────────────────────────────────────────────────────────────────────

def run_extraction(
    text: str,
    prompt: str,
    examples: list,
    model_id: str = DEFAULT_MODEL,
    extraction_passes: int = 1,
    temperature: float = 0.3,
    max_workers: int = 4
) -> dict:
    """Run LangExtract with Ollama backend."""

    try:
        result = extract(
            text_or_documents=text,
            prompt_description=prompt,
            examples=examples,
            model_id=model_id,
            model_url=OLLAMA_URL,
            fence_output=False,  # Required for Ollama
            use_schema_constraints=False,  # Required for Ollama
            extraction_passes=extraction_passes,
            temperature=temperature,
            max_workers=max_workers,
            max_char_buffer=2000  # Chunk size for long docs
        )

        # Convert LangExtract result to our format
        extractions = []
        if hasattr(result, 'extractions'):
            for ext in result.extractions:
                extractions.append({
                    "extraction_class": ext.extraction_class,
                    "extraction_text": ext.extraction_text,
                    "attributes": ext.attributes if hasattr(ext, 'attributes') else {},
                    "start_char": getattr(ext, 'start_char', None),
                    "end_char": getattr(ext, 'end_char', None)
                })

        return {
            "success": True,
            "extractions": extractions,
            "metadata": {
                "model_id": model_id,
                "extraction_passes": extraction_passes,
                "temperature": temperature
            }
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "extractions": []
        }


# ─────────────────────────────────────────────────────────────────────────────
# API Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "langextract-ollama",
        "model": DEFAULT_MODEL,
        "ollama_url": OLLAMA_URL
    }


@app.post("/extract", response_model=ExtractionResponse)
async def extract(request: ExtractionRequest):
    """Extract structured information from text."""

    # Select prompt and examples based on type
    if request.extraction_type == "legal":
        prompt = LEGAL_EXTRACTION_PROMPT
        examples = LEGAL_EXAMPLES
    elif request.extraction_type == "evidence":
        prompt = EVIDENCE_EXTRACTION_PROMPT
        examples = EVIDENCE_EXAMPLES
    elif request.extraction_type == "custom":
        if not request.custom_prompt:
            raise HTTPException(400, "custom_prompt required for type='custom'")
        prompt = request.custom_prompt
        examples = request.custom_examples or []
    else:
        raise HTTPException(400, f"Unknown extraction_type: {request.extraction_type}")

    # Run extraction
    result = run_extraction(
        text=request.text,
        prompt=prompt,
        examples=examples,
        model_id=request.model_id,
        extraction_passes=request.extraction_passes,
        temperature=request.temperature,
        max_workers=request.max_workers
    )

    if not result["success"]:
        raise HTTPException(500, f"Extraction failed: {result.get('error')}")

    import hashlib
    doc_id = hashlib.md5(request.text[:100].encode()).hexdigest()[:12]

    return ExtractionResponse(
        document_id=doc_id,
        total_extractions=len(result["extractions"]),
        extractions=[Extraction(**e) for e in result["extractions"]],
        metadata=result["metadata"]
    )


@app.post("/extract/file")
async def extract_file(request: FileExtractionRequest):
    """Extract from file path or URL."""

    file_path = request.file_path

    # Handle URLs (LangExtract can fetch directly)
    if file_path.startswith(("http://", "https://")):
        text_source = file_path
    else:
        # Read local file
        path = Path(file_path)
        if not path.exists():
            raise HTTPException(404, f"File not found: {file_path}")

        # Support common formats
        if path.suffix.lower() == ".pdf":
            try:
                import pdfplumber
                with pdfplumber.open(path) as pdf:
                    text_source = "\n".join(
                        page.extract_text() or "" for page in pdf.pages
                    )
            except ImportError:
                raise HTTPException(500, "pdfplumber not installed for PDF support")
        else:
            text_source = path.read_text(encoding="utf-8", errors="ignore")

    # Select prompt based on type
    if request.extraction_type == "legal":
        prompt = LEGAL_EXTRACTION_PROMPT
        examples = LEGAL_EXAMPLES
    else:
        prompt = EVIDENCE_EXTRACTION_PROMPT
        examples = EVIDENCE_EXAMPLES

    result = run_extraction(
        text=text_source,
        prompt=prompt,
        examples=examples,
        model_id=request.model_id,
        extraction_passes=request.extraction_passes
    )

    if not result["success"]:
        raise HTTPException(500, f"Extraction failed: {result.get('error')}")

    return {
        "file": file_path,
        "total_extractions": len(result["extractions"]),
        "extractions": result["extractions"],
        "metadata": result["metadata"]
    }


@app.post("/extract/batch")
async def extract_batch(files: list[str], extraction_type: str = "legal"):
    """Batch extract from multiple files/URLs."""

    results = []
    for file_path in files:
        try:
            req = FileExtractionRequest(
                file_path=file_path,
                extraction_type=extraction_type
            )
            result = await extract_file(req)
            results.append({"file": file_path, "status": "success", "result": result})
        except Exception as e:
            results.append({"file": file_path, "status": "error", "error": str(e)})

    return {
        "total_files": len(files),
        "successful": sum(1 for r in results if r["status"] == "success"),
        "results": results
    }


# ─────────────────────────────────────────────────────────────────────────────
# MCP Tool Interface (for FastMCP integration)
# ─────────────────────────────────────────────────────────────────────────────

def extract_legal_entities(text: str, passes: int = 1) -> dict:
    """MCP tool: Extract legal entities from text.

    Args:
        text: Legal document text to analyze
        passes: Number of extraction passes (1-3 recommended)

    Returns:
        Structured extraction with parties, dates, citations, money amounts
    """
    return run_extraction(
        text=text,
        prompt=LEGAL_EXTRACTION_PROMPT,
        examples=LEGAL_EXAMPLES,
        extraction_passes=passes
    )


def extract_evidence_entities(text: str, passes: int = 1) -> dict:
    """MCP tool: Extract evidence/forensic entities from text.

    Args:
        text: Evidence document or investigation notes
        passes: Number of extraction passes (1-3 recommended)

    Returns:
        Structured extraction with persons, locations, contacts, quotes
    """
    return run_extraction(
        text=text,
        prompt=EVIDENCE_EXTRACTION_PROMPT,
        examples=EVIDENCE_EXAMPLES,
        extraction_passes=passes
    )


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="LangExtract Service")
    parser.add_argument("--port", type=int, default=8095)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()

    print(f"""
╔══════════════════════════════════════════════════════════════════╗
║  LangExtract Service (Ollama Backend)                            ║
╠══════════════════════════════════════════════════════════════════╣
║  Model: {DEFAULT_MODEL:<52} ║
║  Ollama: {OLLAMA_URL:<51} ║
║  Port: {args.port:<54} ║
╠══════════════════════════════════════════════════════════════════╣
║  Endpoints:                                                      ║
║    POST /extract       - Extract from text                       ║
║    POST /extract/file  - Extract from file path or URL           ║
║    POST /extract/batch - Batch extraction                        ║
║    GET  /health        - Health check                            ║
╚══════════════════════════════════════════════════════════════════╝
    """)

    uvicorn.run(app, host=args.host, port=args.port)
