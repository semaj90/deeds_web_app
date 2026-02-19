#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - AI Analysis Service
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Analyze patterns with gemma3-legal and generate recommendations
Task: 4.3 - Create AI analysis service
═══════════════════════════════════════════════════════════════════════
"""

import os
import json
import logging
import aiohttp
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime

from backend.services.comment_extraction_service import Comment
from backend.services.pattern_search_service import Pattern, PatternSearchResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Recommendation:
    """AI-generated recommendation."""
    type: str  # 'fix', 'refactor', 'optimize', 'document'
    description: str
    confidence: float  # 0.0 to 1.0
    code: Optional[str] = None
    reasoning: Optional[str] = None
    priority: str = "medium"  # 'low', 'medium', 'high', 'critical'


@dataclass
class Analysis:
    """AI analysis result."""
    summary: str
    recommendations: List[Recommendation] = field(default_factory=list)
    confidence: float = 0.0
    patterns_analyzed: int = 0
    comments_analyzed: int = 0
    issues_found: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    analyzed_at: datetime = field(default_factory=datetime.now)


class AIAnalysisService:
    """
    AI Analysis Service - Analyze patterns with gemma3-legal.

    Features:
    - Integrate gemma3-legal for AI analysis
    - Generate summaries and recommendations
    - Calculate confidence scores (0-1)
    - Return Analysis objects with recommendations
    """

    def __init__(self, ollama_url: Optional[str] = None, model: Optional[str] = None):
        """Initialize AI analysis service."""
        self.ollama_url = ollama_url or os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.model = model or os.getenv("GEMMA3_MODEL", "gemma3-legal:latest")
        logger.info(f"🤖 AIAnalysisService initialized (model: {self.model})")

    async def analyze_patterns(
        self,
        patterns: List[Pattern],
        comments: Optional[List[Comment]] = None,
        context: Optional[str] = None
    ) -> Analysis:
        """
        Analyze code patterns and generate recommendations.

        Args:
            patterns: List of Pattern objects
            comments: Optional list of Comment objects
            context: Optional context string

        Returns:
            Analysis with summary and recommendations
        """
        logger.info(f"🤖 Analyzing {len(patterns)} patterns")

        # Build analysis prompt
        prompt = self._build_analysis_prompt(patterns, comments, context)

        # Call gemma3-legal
        response = await self._call_ollama(prompt)

        # Parse response
        analysis = self._parse_analysis_response(response, patterns, comments)

        logger.info(
            f"✅ Analysis complete: {len(analysis.recommendations)} recommendations, "
            f"confidence: {analysis.confidence:.2f}"
        )

        return analysis

    async def analyze_file(
        self,
        file_path: str,
        patterns: List[Pattern],
        comments: List[Comment]
    ) -> Analysis:
        """
        Analyze a file with patterns and comments.

        Args:
            file_path: Path to file
            patterns: List of Pattern objects
            comments: List of Comment objects

        Returns:
            Analysis with summary and recommendations
        """
        logger.info(f"🤖 Analyzing file: {file_path}")

        context = f"File: {file_path}"
        return await self.analyze_patterns(patterns, comments, context)

    async def generate_summary(
        self,
        patterns: List[Pattern],
        max_length: int = 200
    ) -> str:
        """
        Generate a summary of patterns.

        Args:
            patterns: List of Pattern objects
            max_length: Maximum summary length

        Returns:
            Summary string
        """
        logger.info(f"🤖 Generating summary for {len(patterns)} patterns")

        # Build summary prompt
        prompt = self._build_summary_prompt(patterns, max_length)

        # Call gemma3-legal
        response = await self._call_ollama(prompt)

        # Extract summary
        summary = response.get("response", "").strip()

        logger.info(f"✅ Summary generated: {len(summary)} chars")
        return summary

    async def generate_recommendations(
        self,
        analysis: Analysis,
        max_recommendations: int = 5
    ) -> List[Recommendation]:
        """
        Generate recommendations from analysis.

        Args:
            analysis: Analysis object
            max_recommendations: Maximum number of recommendations

        Returns:
            List of Recommendation objects
        """
        logger.info(f"🤖 Generating recommendations")

        # Build recommendations prompt
        prompt = self._build_recommendations_prompt(analysis, max_recommendations)

        # Call gemma3-legal
        response = await self._call_ollama(prompt)

        # Parse recommendations
        recommendations = self._parse_recommendations_response(response)

        logger.info(f"✅ Generated {len(recommendations)} recommendations")
        return recommendations[:max_recommendations]

    def _build_analysis_prompt(
        self,
        patterns: List[Pattern],
        comments: Optional[List[Comment]],
        context: Optional[str]
    ) -> str:
        """Build analysis prompt for gemma3-legal."""
        prompt_parts = []

        # Context
        if context:
            prompt_parts.append(f"Context: {context}\n")

        # Patterns
        prompt_parts.append(f"Analyzing {len(patterns)} code patterns:\n")
        for i, pattern in enumerate(patterns[:10], 1):  # Limit to 10 patterns
            prompt_parts.append(
                f"{i}. {pattern.pattern_type.value} in {pattern.file}:{pattern.line}\n"
                f"   {pattern.text}\n"
            )

        # Comments
        if comments:
            prompt_parts.append(f"\nComments ({len(comments)}):\n")
            for i, comment in enumerate(comments[:5], 1):  # Limit to 5 comments
                prompt_parts.append(
                    f"{i}. {comment.comment_type.value} at line {comment.line_number}\n"
                    f"   {comment.text}\n"
                )

        # Analysis request
        prompt_parts.append(
            "\nPlease analyze these patterns and provide:\n"
            "1. A brief summary of what the code is doing\n"
            "2. Any potential issues or improvements\n"
            "3. Recommendations for refactoring or optimization\n"
            "4. Confidence score (0.0 to 1.0)\n"
            "\nFormat your response as JSON with keys: summary, issues, recommendations, confidence"
        )

        return "".join(prompt_parts)

    def _build_summary_prompt(self, patterns: List[Pattern], max_length: int) -> str:
        """Build summary prompt for gemma3-legal."""
        prompt_parts = []

        prompt_parts.append(f"Summarize these {len(patterns)} code patterns in {max_length} characters or less:\n\n")

        for i, pattern in enumerate(patterns[:20], 1):  # Limit to 20 patterns
            prompt_parts.append(
                f"{i}. {pattern.pattern_type.value}: {pattern.text[:100]}\n"
            )

        prompt_parts.append(f"\nProvide a concise summary (max {max_length} chars):")

        return "".join(prompt_parts)

    def _build_recommendations_prompt(
        self,
        analysis: Analysis,
        max_recommendations: int
    ) -> str:
        """Build recommendations prompt for gemma3-legal."""
        prompt = f"""
Based on this analysis:

Summary: {analysis.summary}
Issues found: {analysis.issues_found}
Patterns analyzed: {analysis.patterns_analyzed}

Generate {max_recommendations} actionable recommendations for improving the code.

For each recommendation, provide:
1. Type (fix, refactor, optimize, document)
2. Description (what to do)
3. Reasoning (why it's important)
4. Confidence (0.0 to 1.0)
5. Priority (low, medium, high, critical)

Format as JSON array with keys: type, description, reasoning, confidence, priority
"""
        return prompt

    async def _call_ollama(self, prompt: str) -> Dict[str, Any]:
        """Call Ollama API with gemma3-legal."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.7,
                            "top_p": 0.9,
                        }
                    },
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"Ollama API error: {error_text}")

                    return await response.json()

        except aiohttp.ClientTimeout:
            logger.error("❌ Ollama API timeout")
            return {"response": ""}
        except Exception as e:
            logger.error(f"❌ Ollama API error: {e}")
            return {"response": ""}

    def _parse_analysis_response(
        self,
        response: Dict[str, Any],
        patterns: List[Pattern],
        comments: Optional[List[Comment]]
    ) -> Analysis:
        """Parse analysis response from gemma3-legal."""
        response_text = response.get("response", "")

        # Try to parse as JSON
        try:
            # Extract JSON from response
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                data = json.loads(json_str)

                summary = data.get("summary", "")
                confidence = float(data.get("confidence", 0.5))
                issues = data.get("issues", [])
                recommendations_data = data.get("recommendations", [])

                # Parse recommendations
                recommendations = []
                for rec_data in recommendations_data:
                    if isinstance(rec_data, dict):
                        rec = Recommendation(
                            type=rec_data.get("type", "refactor"),
                            description=rec_data.get("description", ""),
                            confidence=float(rec_data.get("confidence", 0.5)),
                            reasoning=rec_data.get("reasoning"),
                            priority=rec_data.get("priority", "medium")
                        )
                        recommendations.append(rec)
                    elif isinstance(rec_data, str):
                        # Simple string recommendation
                        rec = Recommendation(
                            type="refactor",
                            description=rec_data,
                            confidence=0.5
                        )
                        recommendations.append(rec)

                return Analysis(
                    summary=summary,
                    recommendations=recommendations,
                    confidence=confidence,
                    patterns_analyzed=len(patterns),
                    comments_analyzed=len(comments) if comments else 0,
                    issues_found=len(issues)
                )

        except json.JSONDecodeError:
            logger.warning("⚠️  Failed to parse JSON response, using text fallback")

        # Fallback: use response text as summary
        summary = response_text[:500] if response_text else "No analysis available"

        return Analysis(
            summary=summary,
            confidence=0.3,  # Low confidence for fallback
            patterns_analyzed=len(patterns),
            comments_analyzed=len(comments) if comments else 0
        )

    def _parse_recommendations_response(
        self,
        response: Dict[str, Any]
    ) -> List[Recommendation]:
        """Parse recommendations response from gemma3-legal."""
        response_text = response.get("response", "")
        recommendations = []

        try:
            # Extract JSON array from response
            json_start = response_text.find("[")
            json_end = response_text.rfind("]") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                data = json.loads(json_str)

                for rec_data in data:
                    if isinstance(rec_data, dict):
                        rec = Recommendation(
                            type=rec_data.get("type", "refactor"),
                            description=rec_data.get("description", ""),
                            confidence=float(rec_data.get("confidence", 0.5)),
                            reasoning=rec_data.get("reasoning"),
                            priority=rec_data.get("priority", "medium")
                        )
                        recommendations.append(rec)

        except json.JSONDecodeError:
            logger.warning("⚠️  Failed to parse recommendations JSON")

        return recommendations

    async def calculate_confidence(
        self,
        patterns: List[Pattern],
        comments: List[Comment]
    ) -> float:
        """
        Calculate confidence score for analysis.

        Args:
            patterns: List of Pattern objects
            comments: List of Comment objects

        Returns:
            Confidence score (0.0 to 1.0)
        """
        # Simple heuristic: more patterns and comments = higher confidence
        pattern_score = min(len(patterns) / 10.0, 1.0)
        comment_score = min(len(comments) / 5.0, 1.0)

        # Weight patterns more heavily
        confidence = (pattern_score * 0.7) + (comment_score * 0.3)

        return round(confidence, 2)


# Example usage
async def example_usage():
    """Example of using the AIAnalysisService."""
    from backend.services.pattern_search_service import PatternSearchService, PatternType, Pattern
    from backend.services.comment_extraction_service import CommentExtractionService

    service = AIAnalysisService()

    # Create sample patterns
    patterns = [
        Pattern(
            text="createEnhancedTag(data)",
            file="src/lib/services/tag_service.ts",
            line=42,
            column=5,
            pattern_type=PatternType.FUNCTION_CALL,
            matched_symbol="createEnhancedTag"
        ),
        Pattern(
            text="import { createEnhancedTag } from './tag_service'",
            file="src/lib/components/TagManager.svelte",
            line=3,
            column=1,
            pattern_type=PatternType.IMPORT_STATEMENT,
            matched_symbol="createEnhancedTag"
        )
    ]

    # Analyze patterns
    analysis = await service.analyze_patterns(patterns)

    print(f"\n🤖 AI Analysis Results:")
    print(f"   Summary: {analysis.summary[:200]}...")
    print(f"   Confidence: {analysis.confidence:.2f}")
    print(f"   Patterns analyzed: {analysis.patterns_analyzed}")
    print(f"   Issues found: {analysis.issues_found}")
    print(f"   Recommendations: {len(analysis.recommendations)}")

    if analysis.recommendations:
        print(f"\n   Top recommendations:")
        for i, rec in enumerate(analysis.recommendations[:3], 1):
            print(f"      {i}. [{rec.type}] {rec.description}")
            print(f"         Confidence: {rec.confidence:.2f}, Priority: {rec.priority}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(example_usage())
