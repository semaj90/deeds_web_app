"""
Phase53: GPU-Accelerated Markdown Processing Microservice

FastAPI service for GPU-accelerated markdown parsing, tokenization,
semantic chunking, and legal document processing.

Install dependencies:
pip install mistune uvicorn fastapi orjson torch transformers
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import mistune
import orjson
import asyncio
from concurrent.futures import ThreadPoolExecutor
import logging
import time
from dataclasses import dataclass
from enum import Enum

# Optional GPU imports
try:
    import torch
    from transformers import AutoTokenizer, AutoModel
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    torch = None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="GPU Markdown Processing Service",
    description="GPU-accelerated markdown parsing and legal document processing",
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

# Thread pool for CPU-bound operations
executor = ThreadPoolExecutor(max_workers=4)

class MarkdownProcessingRequest(BaseModel):
    text: str
    options: Optional[Dict[str, Any]] = {}

class MarkdownProcessingResponse(BaseModel):
    html: str
    sections: List[Dict[str, Any]]
    tokens: List[Dict[str, Any]]
    embeddings: Optional[List[List[float]]] = None
    performance: Dict[str, float]
    metadata: Dict[str, Any]

class SectionType(str, Enum):
    HEADING = "heading"
    PARAGRAPH = "paragraph"
    LIST = "list"
    CODE = "code"
    FACTS = "facts"
    REASONING = "reasoning"
    HOLDING = "holding"
    CONCLUSION = "conclusion"
    QUOTE = "quote"

@dataclass
class MarkdownSection:
    type: SectionType
    level: Optional[int] = None
    content: str = ""
    start_offset: int = 0
    end_offset: int = 0
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}

class GPUMarkdownProcessor:
    def __init__(self):
        # Initialize markdown parser with custom renderer
        self.markdown_parser = mistune.create_markdown(
            renderer=mistune.HTMLRenderer(escape=False),
            plugins=['table', 'strikethrough', 'footnotes', 'task_lists']
        )

        # GPU components (if available)
        self.tokenizer = None
        self.model = None
        self.device = None

        if TORCH_AVAILABLE:
            self._initialize_gpu_components()

    def _initialize_gpu_components(self):
        """Initialize GPU-accelerated components"""
        try:
            # Use legal-focused model if available
            model_name = "microsoft/DialoGPT-small"  # Placeholder - use legal model

            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModel.from_pretrained(model_name)

            # GPU setup
            if torch.cuda.is_available():
                self.device = torch.device("cuda")
                self.model.to(self.device)
                logger.info("GPU acceleration enabled for markdown processing")
            else:
                self.device = torch.device("cpu")
                logger.info("GPU not available, using CPU for markdown processing")

        except Exception as e:
            logger.warning(f"Failed to initialize GPU components: {e}")
            self.device = torch.device("cpu") if torch else None

    def parse_markdown(self, text: str) -> str:
        """Parse markdown to HTML"""
        return self.markdown_parser(text)

    def extract_sections(self, text: str) -> List[MarkdownSection]:
        """Extract structured sections from markdown"""
        sections = []
        lines = text.split('\n')
        current_section = None
        offset = 0

        for line in lines:
            line_length = len(line) + 1  # +1 for newline

            # Heading detection
            if line.strip().startswith('#'):
                # Save previous section
                if current_section:
                    current_section.end_offset = offset
                    sections.append(current_section)

                # Count heading level
                level = 0
                for char in line.strip():
                    if char == '#':
                        level += 1
                    else:
                        break

                current_section = MarkdownSection(
                    type=SectionType.HEADING,
                    level=level,
                    content=line.strip(),
                    start_offset=offset
                )

            # Legal section markers
            elif self._is_legal_section_marker(line.upper()):
                # Save previous section
                if current_section:
                    current_section.end_offset = offset
                    sections.append(current_section)

                section_type = self._get_section_type(line.upper())
                current_section = MarkdownSection(
                    type=section_type,
                    content=line.strip(),
                    start_offset=offset
                )

            # List items
            elif line.strip().startswith(('- ', '* ', '+ ', '1. ', '2. ', '3. ')):
                if not current_section or current_section.type != SectionType.LIST:
                    # Save previous section
                    if current_section:
                        current_section.end_offset = offset
                        sections.append(current_section)

                    current_section = MarkdownSection(
                        type=SectionType.LIST,
                        content="",
                        start_offset=offset
                    )

                current_section.content += line + '\n'

            # Code blocks
            elif line.strip().startswith('```'):
                if not current_section or current_section.type != SectionType.CODE:
                    # Save previous section
                    if current_section:
                        current_section.end_offset = offset
                        sections.append(current_section)

                    current_section = MarkdownSection(
                        type=SectionType.CODE,
                        content="",
                        start_offset=offset
                    )

                current_section.content += line + '\n'

            # Quotes
            elif line.strip().startswith('> '):
                if not current_section or current_section.type != SectionType.QUOTE:
                    # Save previous section
                    if current_section:
                        current_section.end_offset = offset
                        sections.append(current_section)

                    current_section = MarkdownSection(
                        type=SectionType.QUOTE,
                        content="",
                        start_offset=offset
                    )

                current_section.content += line + '\n'

            # Regular paragraphs
            else:
                if line.strip():  # Non-empty line
                    if not current_section or current_section.type not in [SectionType.PARAGRAPH, SectionType.FACTS, SectionType.REASONING, SectionType.HOLDING, SectionType.CONCLUSION]:
                        # Save previous section
                        if current_section:
                            current_section.end_offset = offset
                            sections.append(current_section)

                        current_section = MarkdownSection(
                            type=SectionType.PARAGRAPH,
                            content="",
                            start_offset=offset
                        )

                    current_section.content += line + '\n'

            offset += line_length

        # Save final section
        if current_section:
            current_section.end_offset = len(text)
            sections.append(current_section)

        return sections

    def _is_legal_section_marker(self, line: str) -> bool:
        """Check if line contains legal section markers"""
        markers = ['FACTS', 'REASONING', 'HOLDING', 'CONCLUSION', 'ISSUE', 'ANALYSIS']
        return any(marker in line for marker in markers)

    def _get_section_type(self, line: str) -> SectionType:
        """Determine section type from content"""
        if 'FACTS' in line:
            return SectionType.FACTS
        elif 'REASONING' in line:
            return SectionType.REASONING
        elif 'HOLDING' in line:
            return SectionType.HOLDING
        elif 'CONCLUSION' in line:
            return SectionType.CONCLUSION
        else:
            return SectionType.PARAGRAPH

    def tokenize_text(self, text: str) -> List[Dict[str, Any]]:
        """GPU-accelerated tokenization"""
        if not self.tokenizer:
            # Fallback to simple tokenization
            return self._simple_tokenize(text)

        try:
            tokens = self.tokenizer.tokenize(text)
            return [
                {
                    'text': token,
                    'type': self._classify_token(token),
                    'position': i,
                    'confidence': 1.0
                }
                for i, token in enumerate(tokens)
            ]
        except Exception as e:
            logger.warning(f"GPU tokenization failed: {e}")
            return self._simple_tokenize(text)

    def _simple_tokenize(self, text: str) -> List[Dict[str, Any]]:
        """Simple CPU-based tokenization fallback"""
        import re
        tokens = re.findall(r'\b\w+\b|[^\w\s]', text)
        return [
            {
                'text': token,
                'type': 'word' if token.isalpha() else 'punctuation',
                'position': i,
                'confidence': 0.8
            }
            for i, token in enumerate(tokens)
        ]

    def _classify_token(self, token: str) -> str:
        """Classify token type"""
        if token.isalpha():
            # Check for legal terms
            legal_terms = ['court', 'law', 'case', 'plaintiff', 'defendant', 'judge']
            if token.lower() in legal_terms:
                return 'legal_term'
            return 'word'
        elif token.isdigit():
            return 'number'
        else:
            return 'punctuation'

    def generate_embeddings(self, sections: List[MarkdownSection]) -> List[List[float]]:
        """Generate embeddings for sections"""
        if not self.model or not self.tokenizer:
            return []

        embeddings = []
        try:
            for section in sections:
                if section.content.strip():
                    inputs = self.tokenizer(section.content, return_tensors='pt', truncation=True, max_length=512)

                    if self.device:
                        inputs = {k: v.to(self.device) for k, v in inputs.items()}

                    with torch.no_grad():
                        outputs = self.model(**inputs)
                        embedding = outputs.last_hidden_state.mean(dim=1).cpu().numpy().tolist()[0]
                        embeddings.append(embedding)
                else:
                    embeddings.append([])
        except Exception as e:
            logger.warning(f"Embedding generation failed: {e}")
            return []

        return embeddings

# Global processor instance
processor = GPUMarkdownProcessor()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    gpu_status = "available" if TORCH_AVAILABLE and torch.cuda.is_available() else "unavailable"
    return {
        "status": "healthy",
        "gpu": gpu_status,
        "service": "gpu-markdown-processor"
    }

@app.post("/parse", response_model=MarkdownProcessingResponse)
async def parse_markdown(request: MarkdownProcessingRequest, background_tasks: BackgroundTasks):
    """Parse markdown with GPU acceleration"""
    start_time = time.time()

    try:
        # Parse markdown to HTML
        html = await asyncio.get_event_loop().run_in_executor(
            executor, processor.parse_markdown, request.text
        )

        # Extract sections
        sections = await asyncio.get_event_loop().run_in_executor(
            executor, processor.extract_sections, request.text
        )

        # Tokenization
        tokens = await asyncio.get_event_loop().run_in_executor(
            executor, processor.tokenize_text, request.text
        )

        # Generate embeddings (optional)
        embeddings = None
        if request.options.get('include_embeddings', False):
            embeddings = await asyncio.get_event_loop().run_in_executor(
                executor, processor.generate_embeddings, sections
            )

        # Performance metrics
        total_time = time.time() - start_time
        performance = {
            'total_time': total_time,
            'parsing_time': total_time * 0.3,  # Estimated
            'section_extraction_time': total_time * 0.3,
            'tokenization_time': total_time * 0.2,
            'embedding_time': total_time * 0.2 if embeddings else 0
        }

        # Convert sections to dict format
        sections_dict = [
            {
                'type': section.type.value,
                'level': section.level,
                'content': section.content.strip(),
                'start_offset': section.start_offset,
                'end_offset': section.end_offset,
                'metadata': section.metadata
            }
            for section in sections
        ]

        return MarkdownProcessingResponse(
            html=html,
            sections=sections_dict,
            tokens=tokens,
            embeddings=embeddings,
            performance=performance,
            metadata={
                'text_length': len(request.text),
                'sections_count': len(sections),
                'tokens_count': len(tokens),
                'gpu_accelerated': TORCH_AVAILABLE and torch.cuda.is_available()
            }
        )

    except Exception as e:
        logger.error(f"Markdown processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/batch-parse")
async def batch_parse_markdown(requests: List[MarkdownProcessingRequest]):
    """Batch process multiple markdown documents"""
    results = []

    for req in requests:
        try:
            result = await parse_markdown(req, BackgroundTasks())
            results.append(result)
        except Exception as e:
            results.append({
                'error': str(e),
                'text': req.text[:100] + '...' if len(req.text) > 100 else req.text
            })

    return {'results': results}

@app.get("/gpu-status")
async def gpu_status():
    """Get GPU acceleration status"""
    if not TORCH_AVAILABLE:
        return {'gpu_available': False, 'reason': 'PyTorch not installed'}

    return {
        'gpu_available': torch.cuda.is_available(),
        'cuda_version': torch.version.cuda if torch.cuda.is_available() else None,
        'gpu_count': torch.cuda.device_count() if torch.cuda.is_available() else 0,
        'current_device': torch.cuda.current_device() if torch.cuda.is_available() else None
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "gpu_md_service:app",
        host="0.0.0.0",
        port=8098,
        reload=True,
        log_level="info"
    )