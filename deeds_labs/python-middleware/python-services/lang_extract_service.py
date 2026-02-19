#!/usr/bin/env python3
"""
Phase 70: Language Extraction Service
Extracts structured information from legal documents using NLP
"""

import os
import sys
import asyncio
import logging
import re
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# NLP libraries
try:
    import spacy
    import nltk
    from nltk.tokenize import sent_tokenize, word_tokenize
    from nltk.corpus import stopwords
    from sklearn.feature_extraction.text import TfidfVectorizer
    NLP_AVAILABLE = True
except ImportError:
    NLP_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Phase 70 Language Extraction Service", version="1.0.0")

class ExtractionRequest(BaseModel):
    text: str
    extract_type: str = "all"  # all, entities, keywords, summary, clauses
    max_keywords: int = 10
    min_confidence: float = 0.1

class ExtractionResponse(BaseModel):
    entities: List[Dict[str, Any]] = []
    keywords: List[Dict[str, Any]] = []
    summary: str = ""
    clauses: List[Dict[str, Any]] = []
    processing_time: float
    confidence_score: float

# Global NLP models
nlp = None

def load_nlp_models():
    """Load NLP models"""
    global nlp

    if not NLP_AVAILABLE:
        logger.warning("NLP libraries not available")
        return

    try:
        # Download NLTK data if needed
        try:
            nltk.data.find('tokenizers/punkt')
        except LookupError:
            nltk.download('punkt', quiet=True)

        try:
            nltk.data.find('corpora/stopwords')
        except LookupError:
            nltk.download('stopwords', quiet=True)

        # Load spaCy model (legal-specific if available)
        try:
            nlp = spacy.load("en_core_web_sm")
            logger.info("✅ Loaded spaCy en_core_web_sm model")
        except OSError:
            logger.warning("spaCy model not found - install with: python -m spacy download en_core_web_sm")

    except Exception as e:
        logger.error(f"Failed to load NLP models: {e}")

def extract_entities(text: str) -> List[Dict[str, Any]]:
    """Extract named entities from text"""
    if not nlp:
        return []

    try:
        doc = nlp(text)
        entities = []

        for ent in doc.ents:
            entities.append({
                "text": ent.text,
                "label": ent.label_,
                "start": ent.start_char,
                "end": ent.end_char,
                "confidence": 0.8  # spaCy doesn't provide confidence scores
            })

        return entities
    except Exception as e:
        logger.error(f"Entity extraction failed: {e}")
        return []

def extract_keywords(text: str, max_keywords: int = 10) -> List[Dict[str, Any]]:
    """Extract keywords using TF-IDF"""
    try:
        # Preprocess text
        text = re.sub(r'[^\w\s]', '', text.lower())

        # Tokenize and remove stopwords
        stop_words = set(stopwords.words('english'))
        words = word_tokenize(text)
        filtered_words = [word for word in words if word not in stop_words and len(word) > 2]

        # Use TF-IDF for keyword extraction
        vectorizer = TfidfVectorizer(max_features=max_keywords, stop_words='english')
        tfidf_matrix = vectorizer.fit_transform([text])
        feature_names = vectorizer.get_feature_names_out()

        # Get top keywords with scores
        scores = tfidf_matrix.toarray()[0]
        keywords = []

        for i, score in enumerate(scores):
            if score > 0:
                keywords.append({
                    "keyword": feature_names[i],
                    "score": float(score),
                    "frequency": filtered_words.count(feature_names[i])
                })

        # Sort by score
        keywords.sort(key=lambda x: x["score"], reverse=True)
        return keywords[:max_keywords]

    except Exception as e:
        logger.error(f"Keyword extraction failed: {e}")
        return []

def generate_summary(text: str) -> str:
    """Generate a simple extractive summary"""
    try:
        sentences = sent_tokenize(text)

        if len(sentences) <= 3:
            return text

        # Simple heuristic: take first, middle, and last sentences
        summary_sentences = []
        summary_sentences.append(sentences[0])  # First sentence

        if len(sentences) > 2:
            middle_idx = len(sentences) // 2
            summary_sentences.append(sentences[middle_idx])  # Middle sentence

        if len(sentences) > 1:
            summary_sentences.append(sentences[-1])  # Last sentence

        return " ".join(summary_sentences)

    except Exception as e:
        logger.error(f"Summary generation failed: {e}")
        return text[:500] + "..." if len(text) > 500 else text

def extract_contract_clauses(text: str) -> List[Dict[str, Any]]:
    """Extract contract clauses and sections"""
    clauses = []

    # Common contract clause patterns
    clause_patterns = {
        "termination": r"(?:termination|cancel|ending).*?(?:\.|;|$)",
        "payment": r"(?:payment|fee|compensation|remuneration).*?(?:\.|;|$)",
        "liability": r"(?:liability|responsibility|obligation).*?(?:\.|;|$)",
        "confidentiality": r"(?:confidential|non.disclosure).*?(?:\.|;|$)",
        "intellectual_property": r"(?:intellectual.property|ip|copyright|patent).*?(?:\.|;|$)",
        "governing_law": r"(?:governing.law|jurisdiction|venue).*?(?:\.|;|$)"
    }

    try:
        sentences = sent_tokenize(text)

        for sentence in sentences:
            sentence_lower = sentence.lower()
            for clause_type, pattern in clause_patterns.items():
                if re.search(pattern, sentence_lower, re.IGNORECASE):
                    clauses.append({
                        "type": clause_type,
                        "text": sentence.strip(),
                        "confidence": 0.7
                    })
                    break  # Only match first pattern

        return clauses

    except Exception as e:
        logger.error(f"Clause extraction failed: {e}")
        return []

@app.on_event("startup")
async def startup_event():
    """Initialize NLP models"""
    load_nlp_models()
    logger.info("✅ Language extraction service initialized")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if NLP_AVAILABLE else "degraded",
        "service": "Phase 70 Language Extraction Service",
        "nlp_available": NLP_AVAILABLE,
        "spacy_loaded": nlp is not None
    }

@app.post("/extract", response_model=ExtractionResponse)
async def extract_information(request: ExtractionRequest):
    """Extract information from text"""
    import time
    start_time = time.time()

    if not NLP_AVAILABLE:
        raise HTTPException(status_code=503, detail="NLP service not available")

    try:
        response = ExtractionResponse(
            entities=[],
            keywords=[],
            summary="",
            clauses=[],
            processing_time=0.0,
            confidence_score=0.0
        )

        # Extract entities
        if request.extract_type in ["all", "entities"]:
            response.entities = extract_entities(request.text)

        # Extract keywords
        if request.extract_type in ["all", "keywords"]:
            response.keywords = extract_keywords(request.text, request.max_keywords)

        # Generate summary
        if request.extract_type in ["all", "summary"]:
            response.summary = generate_summary(request.text)

        # Extract clauses
        if request.extract_type in ["all", "clauses"]:
            response.clauses = extract_contract_clauses(request.text)

        # Calculate processing time and confidence
        processing_time = time.time() - start_time
        response.processing_time = round(processing_time, 2)

        # Simple confidence calculation based on extraction results
        total_extractions = len(response.entities) + len(response.keywords) + len(response.clauses)
        confidence = min(0.9, total_extractions / 20) if total_extractions > 0 else 0.1
        response.confidence_score = round(confidence, 2)

        return response

    except Exception as e:
        logger.error(f"Information extraction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Information extraction failed: {e}")

@app.get("/capabilities")
async def get_capabilities():
    """Get service capabilities"""
    return {
        "extraction_types": ["entities", "keywords", "summary", "clauses", "all"],
        "supported_languages": ["english"],
        "nlp_libraries": ["spacy", "nltk", "sklearn"] if NLP_AVAILABLE else [],
        "features": {
            "named_entity_recognition": NLP_AVAILABLE,
            "keyword_extraction": NLP_AVAILABLE,
            "summarization": NLP_AVAILABLE,
            "clause_extraction": NLP_AVAILABLE
        }
    }

if __name__ == "__main__":
    port = int(os.getenv("LANG_EXTRACT_PORT", "8102"))
    host = os.getenv("LANG_EXTRACT_HOST", "0.0.0.0")

    logger.info(f"🚀 Starting language extraction service on {host}:{port}")
    uvicorn.run(
        "lang_extract_service:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )