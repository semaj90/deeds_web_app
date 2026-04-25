#!/usr/bin/env python3
"""
Phase 66 LangExtract Service
FastAPI service for document structure extraction and language analysis
"""

import os
import sys
import json
import logging
from typing import Dict, List, Optional, Any, Union
from pathlib import Path
import tempfile
import time
import re

# FastAPI and async
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# NLP and ML libraries
import spacy
import torch
from transformers import pipeline, AutoTokenizer, AutoModelForTokenClassification
import numpy as np

# Document processing
import PyPDF2
import docx
from PIL import Image
import easyocr

# Configuration
from dotenv import load_dotenv
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Phase 66 LangExtract Service",
    description="Document structure extraction and language analysis for legal AI",
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

# Pydantic models
class ExtractRequest(BaseModel):
    content: str = Field(..., description="Text content to analyze")
    document_type: Optional[str] = Field("legal", description="Type of document")
    extract_entities: bool = Field(True, description="Extract named entities")
    extract_structure: bool = Field(True, description="Extract document structure")
    language: str = Field("en", description="Document language")

class ExtractResponse(BaseModel):
    document_id: str
    structure: Dict[str, Any]
    entities: List[Dict[str, Any]]
    metadata: Dict[str, Any]
    processing_time: float

class HealthResponse(BaseModel):
    status: str
    services: Dict[str, bool]
    version: str

class LangExtractService:
    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"Using device: {self.device}")

        # Initialize spaCy for NER
        try:
            self.nlp = spacy.load("en_core_web_trf")
            self.spacy_available = True
        except OSError:
            logger.warning("spaCy model not found, installing...")
            os.system("python -m spacy download en_core_web_trf")
            self.nlp = spacy.load("en_core_web_trf")
            self.spacy_available = True

        # Initialize transformers for legal document analysis
        try:
            self.ner_pipeline = pipeline(
                "ner",
                model="dslim/bert-base-NER",
                aggregation_strategy="simple",
                device=0 if torch.cuda.is_available() else -1
            )
            self.ner_available = True
        except Exception as e:
            logger.warning(f"NER pipeline failed to load: {e}")
            self.ner_available = False

        # Legal document patterns
        self.legal_patterns = {
            'contract_sections': re.compile(r'^\d+\.\s+[A-Z][^.]*(?:\n|$)'),
            'parties': re.compile(r'(?:party|parties|between|among)\s+([^,\n]+(?:,\s*[^,\n]+)*)', re.IGNORECASE),
            'dates': re.compile(r'\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b'),
            'amounts': re.compile(r'\$[\d,]+\.?\d*|\b\d+(?:\.\d{2})?\s+(?:dollars?|USD)\b', re.IGNORECASE),
            'clauses': re.compile(r'\b(?:whereas|therefore|notwithstanding|hereinafter|hereto|thereof|herein)\b', re.IGNORECASE)
        }

    async def extract_structure(self, content: str, document_type: str = "legal") -> Dict[str, Any]:
        """Extract document structure and metadata"""
        start_time = time.time()

        # Basic text statistics
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
            'sections': [],
            'metadata': {}
        }

        if document_type == "legal":
            # Extract legal document structure
            structure['legal_elements'] = await self.extract_legal_elements(content)
            structure['sections'] = self.extract_contract_sections(content)
            structure['parties'] = self.extract_parties(content)
            structure['dates'] = self.extract_dates(content)
            structure['financial_terms'] = self.extract_financial_terms(content)

        structure['processing_time'] = time.time() - start_time
        return structure

    async def extract_legal_elements(self, content: str) -> Dict[str, Any]:
        """Extract legal-specific elements"""
        elements = {
            'has_signature_block': bool(re.search(r'\b(?:signature|signed|executed)\b', content, re.IGNORECASE)),
            'has_witness_clause': bool(re.search(r'\b(?:witness|attest|notary)\b', content, re.IGNORECASE)),
            'has_governing_law': bool(re.search(r'\bgoverning law\b', content, re.IGNORECASE)),
            'has_arbitration': bool(re.search(r'\b(?:arbitration|arbitrator)\b', content, re.IGNORECASE)),
            'has_indemnification': bool(re.search(r'\b(?:indemnif|hold harmless)\b', content, re.IGNORECASE)),
            'contract_type': self.classify_contract_type(content)
        }
        return elements

    def classify_contract_type(self, content: str) -> str:
        """Classify the type of legal contract"""
        content_lower = content.lower()

        # Contract type patterns
        contract_types = {
            'employment': ['employment', 'employee', 'employer', 'salary', 'termination'],
            'nda': ['confidential', 'non-disclosure', 'proprietary', 'trade secret'],
            'service': ['service', 'provider', 'client', 'deliverable', 'milestone'],
            'license': ['license', 'licensor', 'licensee', 'intellectual property', 'royalty'],
            'lease': ['lease', 'landlord', 'tenant', 'rent', 'premises'],
            'purchase': ['purchase', 'buyer', 'seller', 'price', 'delivery'],
            'partnership': ['partnership', 'partner', 'profit', 'loss', 'management']
        }

        scores = {}
        for contract_type, keywords in contract_types.items():
            score = sum(1 for keyword in keywords if keyword in content_lower)
            if score > 0:
                scores[contract_type] = score

        if scores:
            return max(scores, key=scores.get)
        return 'general_contract'

    def extract_contract_sections(self, content: str) -> List[Dict[str, Any]]:
        """Extract contract sections and clauses"""
        sections = []

        # Find numbered sections
        for match in self.legal_patterns['contract_sections'].finditer(content):
            section = {
                'title': match.group(0).strip(),
                'start_position': match.start(),
                'content_preview': content[match.start():match.start() + 200] + "..."
            }
            sections.append(section)

        return sections

    def extract_parties(self, content: str) -> List[str]:
        """Extract parties mentioned in the contract"""
        parties = []
        for match in self.legal_patterns['parties'].finditer(content):
            party_text = match.group(1).strip()
            # Clean up party names
            party_text = re.sub(r'\s+', ' ', party_text)
            if len(party_text) > 3 and party_text not in parties:
                parties.append(party_text)

        return parties[:10]  # Limit to top 10 parties

    def extract_dates(self, content: str) -> List[str]:
        """Extract dates from the document"""
        dates = []
        for match in self.legal_patterns['dates'].finditer(content):
            date = match.group(0).strip()
            if date not in dates:
                dates.append(date)

        return dates[:20]  # Limit to 20 dates

    def extract_financial_terms(self, content: str) -> List[Dict[str, Any]]:
        """Extract financial terms and amounts"""
        financial_terms = []
        for match in self.legal_patterns['amounts'].finditer(content):
            term = {
                'amount': match.group(0),
                'position': match.start(),
                'context': content[max(0, match.start()-50):match.end()+50]
            }
            financial_terms.append(term)

        return financial_terms

    async def extract_entities(self, content: str) -> List[Dict[str, Any]]:
        """Extract named entities using spaCy and transformers"""
        entities = []

        # Use spaCy for general NER
        if self.spacy_available:
            doc = self.nlp(content[:100000])  # Limit content length
            for ent in doc.ents:
                entity = {
                    'text': ent.text,
                    'label': ent.label_,
                    'start': ent.start_char,
                    'end': ent.end_char,
                    'confidence': getattr(ent, '_.confidence', 1.0),
                    'source': 'spacy'
                }
                entities.append(entity)

        # Use transformers NER for additional entities
        if self.ner_available:
            try:
                ner_results = self.ner_pipeline(content[:50000])  # Limit for performance
                for result in ner_results:
                    # Avoid duplicates with spaCy results
                    if not any(e['text'] == result['word'] and abs(e['start'] - result['start']) < 5 for e in entities):
                        entity = {
                            'text': result['word'],
                            'label': result['entity_group'],
                            'start': result['start'],
                            'end': result['end'],
                            'confidence': result['score'],
                            'source': 'transformers'
                        }
                        entities.append(entity)
            except Exception as e:
                logger.warning(f"Transformers NER failed: {e}")

        # Sort by position and remove duplicates
        entities.sort(key=lambda x: x['start'])
        unique_entities = []
        seen = set()

        for entity in entities:
            key = (entity['text'], entity['label'])
            if key not in seen:
                unique_entities.append(entity)
                seen.add(key)

        return unique_entities[:100]  # Limit to 100 entities

# Initialize service
extract_service = LangExtractService()

@app.post("/extract", response_model=ExtractResponse)
async def extract_document(request: ExtractRequest):
    """Extract structure and entities from document content"""
    start_time = time.time()

    try:
        # Extract structure
        structure = await extract_service.extract_structure(
            request.content,
            request.document_type
        )

        # Extract entities if requested
        entities = []
        if request.extract_entities:
            entities = await extract_service.extract_entities(request.content)

        processing_time = time.time() - start_time

        response = ExtractResponse(
            document_id=f"doc_{int(time.time())}_{hash(request.content) % 10000}",
            structure=structure,
            entities=entities,
            metadata={
                'language': request.language,
                'document_type': request.document_type,
                'extraction_options': {
                    'extract_entities': request.extract_entities,
                    'extract_structure': request.extract_structure
                }
            },
            processing_time=processing_time
        )

        return response

    except Exception as e:
        logger.error(f"Extraction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

@app.post("/extract/file")
async def extract_from_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    document_type: str = "legal",
    extract_entities: bool = True
):
    """Extract structure from uploaded file"""
    try:
        # Read file content
        content = ""
        file_extension = Path(file.filename).suffix.lower()

        if file_extension == '.pdf':
            # PDF processing
            pdf_reader = PyPDF2.PdfReader(file.file)
            for page in pdf_reader.pages:
                content += page.extract_text() + "\n"
        elif file_extension in ['.docx', '.doc']:
            # Word document processing
            doc = docx.Document(file.file)
            for paragraph in doc.paragraphs:
                content += paragraph.text + "\n"
        elif file_extension in ['.txt', '.md']:
            # Text file processing
            content = (await file.read()).decode('utf-8')
        elif file_extension in ['.jpg', '.jpeg', '.png', '.bmp']:
            # Image processing with OCR
            image = Image.open(file.file)
            ocr_reader = easyocr.Reader(['en'], gpu=torch.cuda.is_available())
            ocr_result = ocr_reader.readtext(np.array(image))
            content = " ".join([text for _, text, _ in ocr_result])
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_extension}")

        # Process content
        request = ExtractRequest(
            content=content,
            document_type=document_type,
            extract_entities=extract_entities
        )

        return await extract_document(request)

    except Exception as e:
        logger.error(f"File extraction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"File extraction failed: {str(e)}")

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    services_status = {
        'spacy': extract_service.spacy_available,
        'transformers_ner': extract_service.ner_available,
        'gpu': torch.cuda.is_available()
    }

    overall_status = "healthy" if all(services_status.values()) else "degraded"

    return HealthResponse(
        status=overall_status,
        services=services_status,
        version="1.0.0"
    )

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Phase 66 LangExtract Service", "version": "1.0.0"}

if __name__ == "__main__":
    port = int(os.getenv('LANEXTRACT_PORT', 8102))
    uvicorn.run(
        "langextract_service:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )