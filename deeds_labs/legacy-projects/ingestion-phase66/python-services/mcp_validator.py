#!/usr/bin/env python3
"""
Phase 66 MCP Document Validator
AI-powered document validation and repair using Gemma3
"""

import os
import sys
import json
import logging
from typing import Dict, List, Optional, Any, Union
from pathlib import Path
import time
import asyncio
import aiohttp

# FastAPI
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# AI/ML libraries
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

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
    title="Phase 66 MCP Document Validator",
    description="AI-powered document validation and repair service",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class ValidationRequest(BaseModel):
    content: str = Field(..., description="Document content to validate")
    document_type: str = Field("legal", description="Type of document")
    validation_rules: List[str] = Field(default_factory=list, description="Specific validation rules")
    repair_enabled: bool = Field(True, description="Enable automatic repair suggestions")

class ValidationResponse(BaseModel):
    document_id: str
    is_valid: bool
    issues: List[Dict[str, Any]]
    repairs: List[Dict[str, Any]]
    confidence_score: float
    processing_time: float
    metadata: Dict[str, Any]

class RepairRequest(BaseModel):
    content: str = Field(..., description="Document content to repair")
    issues: List[Dict[str, Any]] = Field(..., description="Issues identified during validation")
    repair_strategy: str = Field("conservative", description="Repair approach: conservative, moderate, aggressive")

class RepairResponse(BaseModel):
    original_content: str
    repaired_content: str
    changes_made: List[Dict[str, Any]]
    confidence_score: float
    processing_time: float

class MCPDocumentValidator:
    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"Using device: {self.device}")

        # Initialize Gemma3 model for validation
        self.model_name = os.getenv('GEMMA3_MODEL', 'google/gemma-3-4b-it')

        try:
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                device_map="auto"
            )
            self.model_available = True
            logger.info("Gemma3 model loaded successfully")
        except Exception as e:
            logger.warning(f"Failed to load Gemma3 model: {e}. Using fallback validation.")
            self.model_available = False

        # Fallback OCR for image validation
        self.ocr_reader = easyocr.Reader(['en'], gpu=torch.cuda.is_available())

        # Validation rules for different document types
        self.validation_rules = {
            'legal': {
                'required_elements': [
                    'parties', 'date', 'signature', 'consideration',
                    'governing_law', 'jurisdiction'
                ],
                'prohibited_patterns': [
                    'typo', 'inconsistent_terms', 'missing_definitions',
                    'ambiguous_language', 'contradictory_clauses'
                ],
                'structural_requirements': [
                    'clear_sections', 'numbered_clauses', 'proper_headings'
                ]
            },
            'contract': {
                'required_elements': [
                    'offer', 'acceptance', 'consideration', 'capacity',
                    'legality', 'mutual_assent'
                ],
                'risk_patterns': [
                    'unilateral_terms', 'hidden_fees', 'auto_renewal',
                    'limitation_liability', 'arbitration_clauses'
                ]
            }
        }

    async def validate_document(self, content: str, document_type: str, validation_rules: List[str] = None) -> Dict[str, Any]:
        """Validate document using AI and rule-based checks"""
        start_time = time.time()

        issues = []
        repairs = []

        # AI-powered validation using Gemma3
        if self.model_available:
            ai_validation = await self.ai_validate_document(content, document_type)
            issues.extend(ai_validation.get('issues', []))
            repairs.extend(ai_validation.get('repairs', []))

        # Rule-based validation
        rule_issues = self.rule_based_validation(content, document_type, validation_rules or [])
        issues.extend(rule_issues)

        # Structural validation
        structural_issues = self.structural_validation(content, document_type)
        issues.extend(structural_issues)

        # Calculate confidence score
        confidence_score = self.calculate_confidence_score(issues, len(content))

        # Remove duplicate issues
        unique_issues = self.deduplicate_issues(issues)

        result = {
            'is_valid': len(unique_issues) == 0,
            'issues': unique_issues,
            'repairs': repairs,
            'confidence_score': confidence_score,
            'processing_time': time.time() - start_time,
            'metadata': {
                'document_type': document_type,
                'content_length': len(content),
                'validation_methods': ['ai', 'rules', 'structural'] if self.model_available else ['rules', 'structural']
            }
        }

        return result

    async def ai_validate_document(self, content: str, document_type: str) -> Dict[str, Any]:
        """Use Gemma3 for AI-powered document validation"""
        prompt = f"""You are an expert legal document validator. Analyze the following {document_type} document for issues, errors, and potential improvements.

Document Content:
{content[:8000]}... (truncated for analysis)

Please identify:
1. Legal issues or errors
2. Missing required elements
3. Ambiguous or unclear language
4. Potential risks or concerns
5. Suggested repairs or improvements

Format your response as JSON with the following structure:
{{
    "issues": [
        {{
            "type": "error|warning|info",
            "category": "legal|structural|clarity|completeness",
            "description": "Brief description",
            "severity": "high|medium|low",
            "location": "approximate location in text",
            "suggestion": "How to fix it"
        }}
    ],
    "repairs": [
        {{
            "description": "What needs to be repaired",
            "suggested_fix": "How to fix it",
            "confidence": 0.0-1.0
        }}
    ]
}}

Be thorough but concise. Focus on substantive legal and contractual issues."""

        try:
            inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)

            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=1024,
                    do_sample=True,
                    temperature=0.3,
                    top_p=0.9
                )

            response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)

            # Extract JSON from response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1

            if json_start != -1 and json_end > json_start:
                json_str = response[json_start:json_end]
                ai_result = json.loads(json_str)
                return ai_result
            else:
                logger.warning("Could not extract JSON from AI response")
                return {'issues': [], 'repairs': []}

        except Exception as e:
            logger.error(f"AI validation failed: {e}")
            return {'issues': [], 'repairs': []}

    def rule_based_validation(self, content: str, document_type: str, custom_rules: List[str]) -> List[Dict[str, Any]]:
        """Rule-based document validation"""
        issues = []

        rules = self.validation_rules.get(document_type, self.validation_rules['legal'])

        # Check required elements
        for element in rules['required_elements']:
            if not self.check_element_presence(content, element):
                issues.append({
                    'type': 'error',
                    'category': 'completeness',
                    'description': f'Missing required element: {element}',
                    'severity': 'high',
                    'location': 'document',
                    'suggestion': f'Add {element} section to the document'
                })

        # Check prohibited patterns
        for pattern in rules['prohibited_patterns']:
            matches = self.check_pattern_issues(content, pattern)
            issues.extend(matches)

        # Custom rules validation
        for rule in custom_rules:
            rule_issues = self.validate_custom_rule(content, rule)
            issues.extend(rule_issues)

        return issues

    def check_element_presence(self, content: str, element: str) -> bool:
        """Check if a required element is present in the document"""
        element_patterns = {
            'parties': r'\b(?:party|parties|between|among)\b',
            'date': r'\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',
            'signature': r'\b(?:signature|signed|executed|by|on behalf of)\b',
            'consideration': r'\b(?:consideration|payment|exchange|value)\b',
            'governing_law': r'\bgoverning law\b|\bapplicable law\b',
            'jurisdiction': r'\b(?:jurisdiction|venue|court|arbitration)\b',
            'offer': r'\b(?:offer|proposal|agreement to)\b',
            'acceptance': r'\b(?:accept|accepted|agree|agreed)\b',
            'capacity': r'\b(?:capacity|authority|power|right)\b',
            'legality': r'\b(?:legal|lawful|permitted|authorized)\b'
        }

        pattern = element_patterns.get(element, element)
        return bool(re.search(pattern, content, re.IGNORECASE))

    def check_pattern_issues(self, content: str, pattern: str) -> List[Dict[str, Any]]:
        """Check for problematic patterns in content"""
        issues = []

        # Define pattern checks
        pattern_checks = {
            'typo': r'\b(teh|recieve|seperate|occured|comparision|comparsion)\b',
            'inconsistent_terms': r'\b(".*?").*?\1\b',  # Repeated quoted terms (potential inconsistency)
            'missing_definitions': r'\b(?:the|this|such)\s+[A-Z][a-z]+\b',  # Capitalized terms that might need definition
            'ambiguous_language': r'\b(?:reasonable|fair|appropriate|necessary|material)\b.*?\b(?:time|effort|cost)\b',
            'contradictory_clauses': r'\b(?:notwithstanding|despite|regardless)\b'
        }

        if pattern in pattern_checks:
            regex = pattern_checks[pattern]
            matches = list(re.finditer(regex, content, re.IGNORECASE))
            for match in matches:
                issues.append({
                    'type': 'warning',
                    'category': 'clarity',
                    'description': f'Potential {pattern}: {match.group(0)}',
                    'severity': 'medium',
                    'location': f'position {match.start()}-{match.end()}',
                    'suggestion': f'Review and clarify the {pattern}'
                })

        return issues

    def structural_validation(self, content: str, document_type: str) -> List[Dict[str, Any]]:
        """Validate document structure"""
        issues = []

        # Check for proper section numbering
        if document_type in ['legal', 'contract']:
            sections = re.findall(r'^\d+\.', content, re.MULTILINE)
            if len(sections) < 3:
                issues.append({
                    'type': 'warning',
                    'category': 'structure',
                    'description': 'Document may lack proper section structure',
                    'severity': 'low',
                    'location': 'document',
                    'suggestion': 'Consider adding numbered sections for better organization'
                })

        # Check paragraph length
        paragraphs = content.split('\n\n')
        long_paragraphs = [p for p in paragraphs if len(p.split()) > 150]
        if long_paragraphs:
            issues.append({
                'type': 'info',
                'category': 'readability',
                'description': f'Found {len(long_paragraphs)} very long paragraphs (>150 words)',
                'severity': 'low',
                'location': 'various',
                'suggestion': 'Consider breaking up long paragraphs for better readability'
            })

        return issues

    def calculate_confidence_score(self, issues: List[Dict[str, Any]], content_length: int) -> float:
        """Calculate overall confidence score for the validation"""
        if not issues:
            return 1.0

        # Weight issues by severity
        severity_weights = {'high': 0.3, 'medium': 0.2, 'low': 0.1}
        total_penalty = sum(severity_weights.get(issue.get('severity', 'medium'), 0.2) for issue in issues)

        # Normalize by content length (longer documents might have more issues)
        normalized_penalty = min(total_penalty / max(1, content_length / 1000), 0.8)

        confidence = max(0.2, 1.0 - normalized_penalty)
        return round(confidence, 3)

    def deduplicate_issues(self, issues: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate issues"""
        seen = set()
        unique_issues = []

        for issue in issues:
            key = (issue.get('description', ''), issue.get('location', ''))
            if key not in seen:
                unique_issues.append(issue)
                seen.add(key)

        return unique_issues

    async def repair_document(self, content: str, issues: List[Dict[str, Any]], strategy: str = "conservative") -> Dict[str, Any]:
        """Repair document based on identified issues"""
        start_time = time.time()

        repaired_content = content
        changes_made = []

        # Sort issues by severity for repair priority
        severity_order = {'high': 0, 'medium': 1, 'low': 2}
        sorted_issues = sorted(issues, key=lambda x: severity_order.get(x.get('severity', 'medium'), 1))

        for issue in sorted_issues:
            if strategy == "conservative" and issue.get('severity') == 'low':
                continue  # Skip low-severity issues in conservative mode

            repair_result = await self.generate_repair(content, issue, strategy)
            if repair_result['applied']:
                repaired_content = repair_result['new_content']
                changes_made.append({
                    'issue': issue,
                    'repair': repair_result['repair_description'],
                    'confidence': repair_result['confidence']
                })

        confidence_score = sum(change['confidence'] for change in changes_made) / max(1, len(changes_made))

        return {
            'original_content': content,
            'repaired_content': repaired_content,
            'changes_made': changes_made,
            'confidence_score': round(confidence_score, 3),
            'processing_time': time.time() - start_time
        }

    async def generate_repair(self, content: str, issue: Dict[str, Any], strategy: str) -> Dict[str, Any]:
        """Generate a specific repair for an issue"""
        if not self.model_available:
            return {
                'applied': False,
                'new_content': content,
                'repair_description': 'AI model not available',
                'confidence': 0.0
            }

        prompt = f"""You are a legal document editor. Fix the following issue in the document.

Issue: {issue.get('description', '')}
Severity: {issue.get('severity', 'medium')}
Suggestion: {issue.get('suggestion', '')}

Document context around the issue:
{content[max(0, issue.get('location', {}).get('start', 0)-200):issue.get('location', {}).get('end', len(content))+200]}

Strategy: {strategy} (conservative=minimal changes, moderate=balanced, aggressive=comprehensive fixes)

Provide the repaired text section. Focus only on the problematic part and provide the corrected version.

Response format:
REPAIRED_TEXT: [the corrected text]
CONFIDENCE: [0.0-1.0]
EXPLANATION: [brief explanation of the change]"""

        try:
            inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)

            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=512,
                    do_sample=True,
                    temperature=0.2,
                    top_p=0.9
                )

            response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)

            # Parse response
            repaired_match = re.search(r'REPAIRED_TEXT:\s*(.+?)(?=CONFIDENCE:|$)', response, re.DOTALL)
            confidence_match = re.search(r'CONFIDENCE:\s*([0-9.]+)', response)
            explanation_match = re.search(r'EXPLANATION:\s*(.+)', response, re.DOTALL)

            if repaired_match:
                repaired_text = repaired_match.group(1).strip()
                confidence = float(confidence_match.group(1)) if confidence_match else 0.5
                explanation = explanation_match.group(1).strip() if explanation_match else "AI-generated repair"

                # Apply the repair (simplified - in practice, need more sophisticated replacement)
                new_content = content.replace(
                    content[issue.get('location', {}).get('start', 0):issue.get('location', {}).get('end', len(content))],
                    repaired_text
                )

                return {
                    'applied': True,
                    'new_content': new_content,
                    'repair_description': explanation,
                    'confidence': confidence
                }
            else:
                return {
                    'applied': False,
                    'new_content': content,
                    'repair_description': 'Could not generate repair',
                    'confidence': 0.0
                }

        except Exception as e:
            logger.error(f"Repair generation failed: {e}")
            return {
                'applied': False,
                'new_content': content,
                'repair_description': f'Repair failed: {str(e)}',
                'confidence': 0.0
            }

# Initialize validator
validator = MCPDocumentValidator()

@app.post("/validate", response_model=ValidationResponse)
async def validate_document(request: ValidationRequest):
    """Validate a document for issues and compliance"""
    try:
        result = await validator.validate_document(
            request.content,
            request.document_type,
            request.validation_rules
        )

        response = ValidationResponse(
            document_id=f"doc_{int(time.time())}_{hash(request.content) % 10000}",
            is_valid=result['is_valid'],
            issues=result['issues'],
            repairs=result['repairs'],
            confidence_score=result['confidence_score'],
            processing_time=result['processing_time'],
            metadata=result['metadata']
        )

        return response

    except Exception as e:
        logger.error(f"Validation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")

@app.post("/repair", response_model=RepairResponse)
async def repair_document(request: RepairRequest):
    """Repair a document based on identified issues"""
    try:
        result = await validator.repair_document(
            request.content,
            request.issues,
            request.repair_strategy
        )

        return RepairResponse(**result)

    except Exception as e:
        logger.error(f"Repair failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Repair failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if validator.model_available else "degraded",
        "services": {
            "gemma3": validator.model_available,
            "gpu": torch.cuda.is_available()
        },
        "version": "1.0.0"
    }

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Phase 66 MCP Document Validator", "version": "1.0.0"}

if __name__ == "__main__":
    port = int(os.getenv('MCP_VALIDATOR_PORT', 8105))
    uvicorn.run(
        "mcp_validator:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )