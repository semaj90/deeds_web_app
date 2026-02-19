"""
Gemma3 semantic analysis module for evidence processing pipeline.
Extracts legal entities, references, and concepts from text chunks.
"""

import logging
import asyncio
import json
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import aiohttp

logger = logging.getLogger(__name__)


@dataclass
class ChunkAnalysis:
    """Analysis result for a text chunk."""
    chunk_id: str
    entities: List[Dict[str, Any]] = field(default_factory=list)
    references: List[Dict[str, Any]] = field(default_factory=list)
    concepts: List[Dict[str, Any]] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    confidence: float = 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'chunk_id': self.chunk_id,
            'entities': self.entities,
            'references': self.references,
            'concepts': self.concepts,
            'tags': self.tags,
            'confidence': self.confidence,
            'metadata': self.metadata
        }


class Gemma3Analyzer:
    """Semantic analyzer using Gemma3 for legal document analysis."""

    def __init__(
        self,
        ollama_base_url: str = "http://localhost:11434",
        model_name: str = "gemma3:latest",
        timeout: int = 60
    ):
        """
        Initialize Gemma3 analyzer.

        Args:
            ollama_base_url: Base URL for Ollama API
            model_name: Gemma3 model name
            timeout: Request timeout in seconds
        """
        self.ollama_base_url = ollama_base_url
        self.model_name = model_name
        self.timeout = timeout

        # Legal entity types
        self.entity_types = [
            'person', 'organization', 'location', 'statute', 'case_name',
            'court', 'judge', 'attorney', 'party', 'plaintiff', 'defendant'
        ]

        # Reference types
        self.reference_types = [
            'statute', 'regulation', 'case_citation', 'rule', 'code_section'
        ]

        # Legal concepts
        self.legal_concepts = [
            'liability', 'damages', 'contract', 'agreement', 'obligation',
            'right', 'duty', 'breach', 'remedy', 'jurisdiction', 'venue',
            'evidence', 'testimony', 'discovery', 'motion', 'appeal'
        ]

        logger.info(f"Initialized Gemma3Analyzer: {model_name}")

    async def analyze_chunk(
        self,
        chunk_id: str,
        content: str
    ) -> ChunkAnalysis:
        """
        Analyze a text chunk for legal entities, references, and concepts.

        Args:
            chunk_id: Unique chunk identifier
            content: Text content to analyze

        Returns:
            ChunkAnalysis object
        """
        try:
            logger.info(f"Analyzing chunk: {chunk_id}")

            # Create analysis prompt
            prompt = self._create_analysis_prompt(content)

            # Call Gemma3
            response = await self._call_gemma3(prompt)

            # Parse response
            analysis = await self._parse_analysis_response(chunk_id, response, content)

            logger.info(
                f"Analysis complete: {len(analysis.entities)} entities, "
                f"{len(analysis.references)} references, "
                f"{len(analysis.concepts)} concepts"
            )

            return analysis

        except Exception as e:
            logger.error(f"Failed to analyze chunk: {e}")
            # Return empty analysis on error
            return ChunkAnalysis(chunk_id=chunk_id, confidence=0.0)

    async def batch_analyze_chunks(
        self,
        chunks: List[Dict[str, str]],
        max_concurrent: int = 5
    ) -> List[ChunkAnalysis]:
        """
        Analyze multiple chunks concurrently.

        Args:
            chunks: List of dicts with 'id' and 'content' keys
            max_concurrent: Maximum concurrent requests

        Returns:
            List of ChunkAnalysis objects
        """
        try:
            logger.info(f"Batch analyzing {len(chunks)} chunks")

            # Create semaphore for concurrency control
            semaphore = asyncio.Semaphore(max_concurrent)

            async def analyze_with_semaphore(chunk):
                async with semaphore:
                    return await self.analyze_chunk(chunk['id'], chunk['content'])

            # Analyze all chunks concurrently
            results = await asyncio.gather(
                *[analyze_with_semaphore(chunk) for chunk in chunks],
                return_exceptions=True
            )

            # Filter out exceptions
            analyses = [r for r in results if isinstance(r, ChunkAnalysis)]

            logger.info(f"Batch analysis complete: {len(analyses)} successful")
            return analyses

        except Exception as e:
            logger.error(f"Failed to batch analyze chunks: {e}")
            return []

    def _create_analysis_prompt(self, content: str) -> str:
        """
        Create analysis prompt for Gemma3.

        Args:
            content: Text to analyze

        Returns:
            Prompt string
        """
        prompt = f"""Analyze the following legal document text and extract:
1. Legal entities (persons, organizations, courts, etc.)
2. Legal references (statutes, cases, regulations)
3. Key legal concepts
4. Relevant tags

Text to analyze:
{content}

Provide response in JSON format with the following structure:
{{
    "entities": [
        {{"type": "entity_type", "value": "entity_value", "confidence": 0.95}}
    ],
    "references": [
        {{"type": "reference_type", "value": "reference_value", "confidence": 0.95}}
    ],
    "concepts": [
        {{"name": "concept_name", "confidence": 0.95}}
    ],
    "tags": ["tag1", "tag2"],
    "overall_confidence": 0.95
}}

Be precise and only include high-confidence extractions."""

        return prompt

    async def _call_gemma3(self, prompt: str) -> str:
        """
        Call Gemma3 API via Ollama.

        Args:
            prompt: Prompt to send

        Returns:
            Response text
        """
        try:
            url = f"{self.ollama_base_url}/api/generate"

            payload = {
                "model": self.model_name,
                "prompt": prompt,
                "stream": False,
                "temperature": 0.3,  # Lower temperature for more consistent results
                "top_p": 0.9
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=self.timeout)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get('response', '')
                    else:
                        logger.error(f"Gemma3 API error: {response.status}")
                        return ""

        except asyncio.TimeoutError:
            logger.error("Gemma3 API timeout")
            return ""
        except Exception as e:
            logger.error(f"Failed to call Gemma3: {e}")
            return ""

    async def _parse_analysis_response(
        self,
        chunk_id: str,
        response: str,
        content: str
    ) -> ChunkAnalysis:
        """
        Parse Gemma3 response into ChunkAnalysis.

        Args:
            chunk_id: Chunk identifier
            response: Gemma3 response text
            content: Original content

        Returns:
            ChunkAnalysis object
        """
        try:
            # Extract JSON from response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1

            if json_start == -1 or json_end == 0:
                logger.warning("No JSON found in response")
                return ChunkAnalysis(chunk_id=chunk_id, confidence=0.0)

            json_str = response[json_start:json_end]
            data = json.loads(json_str)

            # Create analysis object
            analysis = ChunkAnalysis(
                chunk_id=chunk_id,
                entities=data.get('entities', []),
                references=data.get('references', []),
                concepts=data.get('concepts', []),
                tags=data.get('tags', []),
                confidence=data.get('overall_confidence', 0.5),
                metadata={
                    'content_length': len(content),
                    'word_count': len(content.split())
                }
            )

            return analysis

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {e}")
            return ChunkAnalysis(chunk_id=chunk_id, confidence=0.0)
        except Exception as e:
            logger.error(f"Failed to parse response: {e}")
            return ChunkAnalysis(chunk_id=chunk_id, confidence=0.0)

    def extract_legal_tags(
        self,
        entities: List[Dict[str, Any]],
        references: List[Dict[str, Any]],
        concepts: List[Dict[str, Any]]
    ) -> List[str]:
        """
        Generate legal tags from analysis results.

        Args:
            entities: Extracted entities
            references: Extracted references
            concepts: Extracted concepts

        Returns:
            List of tags
        """
        tags = set()

        # Add entity type tags
        for entity in entities:
            entity_type = entity.get('type', '').lower()
            if entity_type:
                tags.add(f"entity:{entity_type}")

        # Add reference type tags
        for reference in references:
            ref_type = reference.get('type', '').lower()
            if ref_type:
                tags.add(f"reference:{ref_type}")

        # Add concept tags
        for concept in concepts:
            concept_name = concept.get('name', '').lower()
            if concept_name:
                tags.add(f"concept:{concept_name}")

        return sorted(list(tags))

    def get_analysis_summary(self, analysis: ChunkAnalysis) -> Dict[str, Any]:
        """
        Get summary of analysis results.

        Args:
            analysis: ChunkAnalysis object

        Returns:
            Summary dictionary
        """
        return {
            'chunk_id': analysis.chunk_id,
            'entity_count': len(analysis.entities),
            'reference_count': len(analysis.references),
            'concept_count': len(analysis.concepts),
            'tag_count': len(analysis.tags),
            'confidence': analysis.confidence,
            'entity_types': list(set(e.get('type', '') for e in analysis.entities)),
            'reference_types': list(set(r.get('type', '') for r in analysis.references)),
            'concept_names': list(set(c.get('name', '') for c in analysis.concepts))
        }
