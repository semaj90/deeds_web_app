#!/usr/bin/env python3
"""
Optimized LangExtract Service - Memory-efficient version
Target: ~200-300MB RAM (down from 1GB)
Changes:
- spaCy en_core_web_md (40MB) instead of en_core_web_trf (500MB)
- Removed in-process BERT model — uses Ollama for NER
- Lazy model loading — models load on first use
- Removed EasyOCR (use server-side tesseract.js instead)
- Optional gRPC support for efficient binary payloads
"""

import os
import sys
import json
import logging
import re
import asyncio
import time
from typing import Dict, List, Optional, Any
from functools import lru_cache
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

# Optional PyPDF2 and docx - lazy loaded
PDF_AVAILABLE = False
DOCX_AVAILABLE = False

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://host.docker.internal:11434')
SPACY_MODEL = os.environ.get('SPACY_MODEL', 'en_core_web_md')  # 40MB vs 500MB
ENABLE_SPACY = os.environ.get('ENABLE_SPACY', 'true').lower() == 'true'

# Pydantic models
class ExtractRequest(BaseModel):
    content: str = Field(..., description="Text content to analyze")
    document_type: Optional[str] = Field("legal", description="Type of document")
    extract_entities: bool = Field(True, description="Extract named entities")
    extract_structure: bool = Field(True, description="Extract document structure")
    use_ollama_ner: bool = Field(False, description="Use Ollama for NER (slower but better)")

class ExtractResponse(BaseModel):
    document_id: str
    structure: Dict[str, Any]
    entities: List[Dict[str, Any]]
    metadata: Dict[str, Any]
    processing_time: float

class HealthResponse(BaseModel):
    status: str
    services: Dict[str, bool]
    memory_mb: float


class LazySpaCy:
    """Lazy-load spaCy model only when needed"""
    _nlp = None

    @classmethod
    def get(cls):
        if cls._nlp is None and ENABLE_SPACY:
            try:
                import spacy
                logger.info(f"Loading spaCy model: {SPACY_MODEL}")
                cls._nlp = spacy.load(SPACY_MODEL)
                logger.info(f"spaCy {SPACY_MODEL} loaded successfully")
            except OSError:
                logger.warning(f"spaCy model {SPACY_MODEL} not found, downloading...")
                import subprocess
                subprocess.run([sys.executable, "-m", "spacy", "download", SPACY_MODEL], check=True)
                import spacy
                cls._nlp = spacy.load(SPACY_MODEL)
        return cls._nlp


class LangExtractService:
    def __init__(self):
        # Legal document patterns (zero memory cost)
        self.legal_patterns = {
            'contract_sections': re.compile(r'^\d+\.\s+[A-Z][^.]*(?:\n|$)', re.MULTILINE),
            'parties': re.compile(r'(?:party|parties|between|among)\s+([^,\n]+(?:,\s*[^,\n]+)*)', re.IGNORECASE),
            'dates': re.compile(r'\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b'),
            'amounts': re.compile(r'\$[\d,]+\.?\d*|\b\d+(?:\.\d{2})?\s+(?:dollars?|USD)\b', re.IGNORECASE),
            'clauses': re.compile(r'\b(?:whereas|therefore|notwithstanding|hereinafter|hereto|thereof|herein)\b', re.IGNORECASE),
            'citations': re.compile(r'\d+\s+U\.S\.C\.\s+§?\s*\d+|\d+\s+F\.\s*(?:2d|3d|Supp\.)\s+\d+', re.IGNORECASE),
            'case_refs': re.compile(r'[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+', re.IGNORECASE),
        }

        # HTTP client for Ollama
        self.http_client: Optional[httpx.AsyncClient] = None

    async def get_http_client(self) -> httpx.AsyncClient:
        if self.http_client is None or self.http_client.is_closed:
            self.http_client = httpx.AsyncClient(timeout=30.0)
        return self.http_client

    async def close(self):
        if self.http_client and not self.http_client.is_closed:
            await self.http_client.aclose()

    async def extract_entities_spacy(self, content: str) -> List[Dict[str, Any]]:
        """Extract entities using spaCy (fast, local)"""
        nlp = LazySpaCy.get()
        if nlp is None:
            return []

        # Process in chunks to avoid memory spikes
        max_len = 100000
        if len(content) > max_len:
            content = content[:max_len]

        doc = nlp(content)
        entities = []
        seen = set()

        for ent in doc.ents:
            key = (ent.text.strip().lower(), ent.label_)
            if key not in seen:
                seen.add(key)
                entities.append({
                    'text': ent.text.strip(),
                    'label': ent.label_,
                    'start': ent.start_char,
                    'end': ent.end_char,
                    'source': 'spacy'
                })

        return entities

    async def extract_entities_ollama(self, content: str) -> List[Dict[str, Any]]:
        """Extract entities using Ollama (slower but higher quality)"""
        client = await self.get_http_client()

        # Limit content for LLM
        max_len = 8000
        if len(content) > max_len:
            content = content[:max_len] + "..."

        prompt = f"""Extract legal entities from this document. Return a JSON array of objects with keys: text, label, importance.
Labels should be: PERSON, ORG, DATE, MONEY, STATUTE, CASE_CITATION, CLAUSE, LOCATION.
Document:
{content}

JSON array:"""

        try:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "gemma4-legal:latest",
                    "prompt": prompt,
                    "stream": False,
                    "options": {"num_predict": 1000, "temperature": 0.1}
                }
            )

            if response.status_code == 200:
                result = response.json()
                text = result.get('response', '')

                # Try to parse JSON from response
                try:
                    # Find JSON array in response
                    start = text.find('[')
                    end = text.rfind(']') + 1
                    if start != -1 and end > start:
                        entities = json.loads(text[start:end])
                        return [
                            {**e, 'source': 'ollama'}
                            for e in entities
                            if isinstance(e, dict) and 'text' in e
                        ]
                except json.JSONDecodeError:
                    pass
        except Exception as e:
            logger.warning(f"Ollama NER failed: {e}")

        return []

    async def extract_entities_regex(self, content: str) -> List[Dict[str, Any]]:
        """Extract entities using regex patterns (instant, zero-cost)"""
        entities = []

        # Extract dates
        for match in self.legal_patterns['dates'].finditer(content):
            entities.append({
                'text': match.group(0),
                'label': 'DATE',
                'start': match.start(),
                'end': match.end(),
                'source': 'regex'
            })

        # Extract money amounts
        for match in self.legal_patterns['amounts'].finditer(content):
            entities.append({
                'text': match.group(0),
                'label': 'MONEY',
                'start': match.start(),
                'end': match.end(),
                'source': 'regex'
            })

        # Extract legal citations
        for match in self.legal_patterns['citations'].finditer(content):
            entities.append({
                'text': match.group(0),
                'label': 'STATUTE',
                'start': match.start(),
                'end': match.end(),
                'source': 'regex'
            })

        # Extract case references
        for match in self.legal_patterns['case_refs'].finditer(content):
            entities.append({
                'text': match.group(0),
                'label': 'CASE_CITATION',
                'start': match.start(),
                'end': match.end(),
                'source': 'regex'
            })

        return entities

    async def extract_structure(self, content: str, document_type: str = "legal") -> Dict[str, Any]:
        """Extract document structure (pure regex, instant)"""
        sentences = re.split(r'[.!?]+', content)
        words = content.split()
        paragraphs = content.split('\n\n')

        structure = {
            'basic_stats': {
                'word_count': len(words),
                'sentence_count': len([s for s in sentences if s.strip()]),
                'paragraph_count': len([p for p in paragraphs if p.strip()]),
                'character_count': len(content),
                'average_words_per_sentence': len(words) / max(1, len(sentences))
            },
            'document_type': document_type,
            'legal_elements': {
                'has_signature': bool(re.search(r'\b(?:signature|signed|executed)\b', content, re.I)),
                'has_witness': bool(re.search(r'\b(?:witness|attest|notary)\b', content, re.I)),
                'has_governing_law': bool(re.search(r'\bgoverning law\b', content, re.I)),
                'has_arbitration': bool(re.search(r'\b(?:arbitration|arbitrator)\b', content, re.I)),
                'clause_count': len(self.legal_patterns['clauses'].findall(content))
            },
            'sections': [],
            'contract_type': self.classify_contract_type(content)
        }

        # Extract sections
        for match in self.legal_patterns['contract_sections'].finditer(content[:20000]):
            structure['sections'].append({
                'title': match.group(0).strip()[:100],
                'position': match.start()
            })

        return structure

    def classify_contract_type(self, content: str) -> str:
        """Fast contract classification using keyword scoring"""
        content_lower = content.lower()

        types = {
            'employment': ['employment', 'employee', 'employer', 'salary', 'termination', 'benefits'],
            'nda': ['confidential', 'non-disclosure', 'proprietary', 'trade secret', 'nda'],
            'service': ['service', 'provider', 'client', 'deliverable', 'milestone', 'scope of work'],
            'license': ['license', 'licensor', 'licensee', 'intellectual property', 'royalty'],
            'lease': ['lease', 'landlord', 'tenant', 'rent', 'premises', 'occupancy'],
            'purchase': ['purchase', 'buyer', 'seller', 'price', 'delivery', 'warranty'],
            'partnership': ['partnership', 'partner', 'profit', 'loss', 'joint venture']
        }

        scores = {t: sum(1 for k in kw if k in content_lower) for t, kw in types.items()}
        return max(scores, key=scores.get) if any(scores.values()) else 'general'

    async def process(self, request: ExtractRequest) -> ExtractResponse:
        """Main processing pipeline"""
        start = time.time()
        doc_id = f"doc_{int(start * 1000)}"

        # Extract structure (instant)
        structure = await self.extract_structure(request.content, request.document_type)

        # Extract entities using configured strategy
        entities = []
        if request.extract_entities:
            # Always get regex entities (free)
            entities.extend(await self.extract_entities_regex(request.content))

            # Use spaCy if available and not using Ollama
            if not request.use_ollama_ner:
                spacy_ents = await self.extract_entities_spacy(request.content)
                entities.extend(spacy_ents)
            else:
                # Use Ollama for higher quality NER
                ollama_ents = await self.extract_entities_ollama(request.content)
                entities.extend(ollama_ents)

        # Dedupe by text + label
        seen = set()
        unique_entities = []
        for ent in entities:
            key = (ent['text'].lower(), ent['label'])
            if key not in seen:
                seen.add(key)
                unique_entities.append(ent)

        return ExtractResponse(
            document_id=doc_id,
            structure=structure,
            entities=unique_entities,
            metadata={
                'model': SPACY_MODEL if not request.use_ollama_ner else 'ollama/gemma4-legal',
                'entity_count': len(unique_entities),
                'section_count': len(structure['sections'])
            },
            processing_time=time.time() - start
        )


# Global service instance
service: Optional[LangExtractService] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global service
    service = LangExtractService()
    logger.info("LangExtract service initialized")
    yield
    if service:
        await service.close()
    logger.info("LangExtract service shut down")


# FastAPI app
app = FastAPI(
    title="Optimized LangExtract Service",
    description="Memory-efficient document structure extraction",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check with memory stats"""
    import psutil
    process = psutil.Process()
    mem_mb = process.memory_info().rss / (1024 * 1024)

    # Check Ollama connectivity
    ollama_ok = False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            ollama_ok = r.status_code == 200
    except:
        pass

    return HealthResponse(
        status="healthy",
        services={
            "spacy_loaded": LazySpaCy._nlp is not None,
            "spacy_enabled": ENABLE_SPACY,
            "ollama_available": ollama_ok
        },
        memory_mb=round(mem_mb, 1)
    )


@app.post("/analyze", response_model=ExtractResponse)
async def analyze(request: ExtractRequest):
    """Extract structure and entities from document"""
    if service is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    return await service.process(request)


@app.post("/extract")
async def extract(request: ExtractRequest):
    """Alias for /analyze"""
    return await analyze(request)


@app.get("/")
async def root():
    return {"service": "langextract-optimized", "version": "2.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "langextract_service:app",
        host="0.0.0.0",
        port=8095,
        workers=2,
        log_level="info"
    )
