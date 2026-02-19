"""
LangExtract API - Python NER and Entity Extraction
FastAPI endpoint for legal text analysis and entity tagging
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import spacy
import uvicorn
from datetime import datetime

# Initialize FastAPI
app = FastAPI(
    title="LangExtract API",
    description="Legal text NER and entity extraction service",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load spaCy model
try:
    nlp = spacy.load("en_core_web_sm")
    print("✅ spaCy model loaded: en_core_web_sm")
except OSError:
    print("⚠️  Downloading spaCy model...")
    import subprocess
    subprocess.run(["python", "-m", "spacy", "download", "en_core_web_sm"])
    nlp = spacy.load("en_core_web_sm")

# Request/Response models
class ExtractRequest(BaseModel):
    text: str
    extract_entities: bool = True
    extract_keywords: bool = False
    min_confidence: float = 0.5

class Entity(BaseModel):
    text: str
    label: str
    start: int
    end: int
    confidence: float = 1.0

class ExtractResponse(BaseModel):
    entities: List[Entity]
    keywords: Optional[List[str]] = None
    language: str = "en"
    processing_time_ms: float
    timestamp: str

class HealthResponse(BaseModel):
    status: str
    model: str
    timestamp: str

# Endpoints
@app.get("/", response_model=dict)
async def root():
    """API information"""
    return {
        "name": "LangExtract API",
        "version": "1.0.0",
        "endpoints": [
            "/extract - POST - Extract entities from text",
            "/health - GET - Health check",
        ]
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        model="en_core_web_sm",
        timestamp=datetime.utcnow().isoformat()
    )

@app.post("/extract", response_model=ExtractResponse)
async def extract_entities(request: ExtractRequest):
    """
    Extract named entities and keywords from text
    
    Supports:
    - Named Entity Recognition (NER)
    - Keyword extraction (optional)
    - Legal-specific entity types
    """
    start_time = datetime.utcnow()
    
    try:
        # Process text with spaCy
        doc = nlp(request.text)
        
        entities = []
        
        if request.extract_entities:
            for ent in doc.ents:
                # Calculate confidence (spaCy doesn't provide this, using 1.0)
                # In production, use a model that provides confidence scores
                confidence = 1.0
                
                if confidence >= request.min_confidence:
                    entities.append(Entity(
                        text=ent.text,
                        label=ent.label_,
                        start=ent.start_char,
                        end=ent.end_char,
                        confidence=confidence
                    ))
        
        keywords = None
        if request.extract_keywords:
            # Extract noun chunks as keywords
            keywords = list(set([
                chunk.text.lower() 
                for chunk in doc.noun_chunks 
                if len(chunk.text) > 3
            ]))[:20]  # Top 20 keywords
        
        # Calculate processing time
        end_time = datetime.utcnow()
        processing_time_ms = (end_time - start_time).total_seconds() * 1000
        
        return ExtractResponse(
            entities=entities,
            keywords=keywords,
            processing_time_ms=processing_time_ms,
            timestamp=end_time.isoformat()
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

@app.post("/batch-extract")
async def batch_extract(texts: List[str]):
    """
    Batch process multiple texts for entity extraction
    More efficient than multiple single requests
    """
    start_time = datetime.utcnow()
    
    results = []
    
    for text in texts:
        doc = nlp(text)
        entities = [
            {
                "text": ent.text,
                "label": ent.label_,
                "start": ent.start_char,
                "end": ent.end_char
            }
            for ent in doc.ents
        ]
        results.append({"text": text[:100], "entities": entities})
    
    end_time = datetime.utcnow()
    processing_time_ms = (end_time - start_time).total_seconds() * 1000
    
    return {
        "count": len(results),
        "results": results,
        "processing_time_ms": processing_time_ms,
        "timestamp": end_time.isoformat()
    }

@app.get("/models")
async def list_models():
    """List available NLP models"""
    return {
        "current": "en_core_web_sm",
        "available": [
            "en_core_web_sm - Small English model (35MB)",
            "en_core_web_md - Medium English model (91MB)",
            "en_core_web_lg - Large English model (587MB)",
        ],
        "note": "Change model in code and restart service"
    }

# Run server
if __name__ == "__main__":
    print("🚀 Starting LangExtract API...")
    print("   URL: http://localhost:5051")
    print("   Docs: http://localhost:5051/docs")
    print("")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=5051,
        log_level="info"
    )
