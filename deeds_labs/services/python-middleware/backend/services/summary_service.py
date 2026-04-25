"""
S3+S4 Hybrid Legal+Semantic Summary Service
Generates compliance-focused and semantic summaries
"""

import logging
from typing import Dict, List, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class SummaryType(Enum):
    LEGAL = "legal"
    SEMANTIC = "semantic"
    HYBRID = "hybrid"

@dataclass
class Summary:
    type: SummaryType
    content: str
    key_points: List[str]
    compliance_score: float
    semantic_score: float
    metadata: Dict

class S3S4SummaryService:
    """S3 (Legal) + S4 (Semantic) Hybrid Summarization"""

    def __init__(self):
        self.legal_keywords = {
            'compliance': ['comply', 'regulation', 'requirement', 'mandate', 'statute'],
            'liability': ['liable', 'responsible', 'indemnify', 'damages', 'claim'],
            'contract': ['agreement', 'party', 'obligation', 'term', 'condition'],
            'intellectual_property': ['patent', 'trademark', 'copyright', 'license', 'proprietary'],
        }

        self.semantic_markers = {
            'entity': ['person', 'organization', 'location', 'product', 'service'],
            'action': ['perform', 'execute', 'deliver', 'provide', 'implement'],
            'temporal': ['before', 'after', 'during', 'within', 'upon'],
            'conditional': ['if', 'unless', 'provided', 'subject', 'contingent'],
        }

    def summarize(self, text: str, summary_type: SummaryType = SummaryType.HYBRID) -> Summary:
        """Generate hybrid S3+S4 summary"""

        if summary_type == SummaryType.LEGAL:
            return self._legal_summary(text)
        elif summary_type == SummaryType.SEMANTIC:
            return self._semantic_summary(text)
        else:
            return self._hybrid_summary(text)

    def _legal_summary(self, text: str) -> Summary:
        """S3: Legal compliance-focused summary"""
        key_points = self._extract_legal_points(text)
        compliance_score = self._calculate_compliance_score(text, key_points)

        return Summary(
            type=SummaryType.LEGAL,
            content=self._generate_legal_summary(text, key_points),
            key_points=key_points,
            compliance_score=compliance_score,
            semantic_score=0.0,
            metadata={'focus': 'compliance', 'regulations': self._extract_regulations(text)},
        )

    def _semantic_summary(self, text: str) -> Summary:
        """S4: Semantic meaning-focused summary"""
        key_points = self._extract_semantic_points(text)
        semantic_score = self._calculate_semantic_score(text, key_points)

        return Summary(
            type=SummaryType.SEMANTIC,
            content=self._generate_semantic_summary(text, key_points),
            key_points=key_points,
            compliance_score=0.0,
            semantic_score=semantic_score,
            metadata={'focus': 'meaning', 'entities': self._extract_entities(text)},
        )

    def _hybrid_summary(self, text: str) -> Summary:
        """S3+S4: Combined legal and semantic summary"""
        legal_points = self._extract_legal_points(text)
        semantic_points = self._extract_semantic_points(text)

        compliance_score = self._calculate_compliance_score(text, legal_points)
        semantic_score = self._calculate_semantic_score(text, semantic_points)

        combined_points = list(set(legal_points + semantic_points))[:5]

        return Summary(
            type=SummaryType.HYBRID,
            content=self._generate_hybrid_summary(text, legal_points, semantic_points),
            key_points=combined_points,
            compliance_score=compliance_score,
            semantic_score=semantic_score,
            metadata={
                'focus': 'hybrid',
                'legal_weight': 0.5,
                'semantic_weight': 0.5,
                'regulations': self._extract_regulations(text),
                'entities': self._extract_entities(text),
            },
        )

    def _extract_legal_points(self, text: str) -> List[str]:
        """Extract legal compliance points"""
        points = []
        text_lower = text.lower()

        for category, keywords in self.legal_keywords.items():
            for keyword in keywords:
                if keyword in text_lower:
                    points.append(f"{category}: {keyword}")

        return points[:5]

    def _extract_semantic_points(self, text: str) -> List[str]:
        """Extract semantic meaning points"""
        points = []
        text_lower = text.lower()

        for category, markers in self.semantic_markers.items():
            for marker in markers:
                if marker in text_lower:
                    points.append(f"{category}: {marker}")

        return points[:5]

    def _calculate_compliance_score(self, text: str, points: List[str]) -> float:
        """Calculate compliance relevance score (0-1)"""
        if not points:
            return 0.0
        return min(len(points) / 10.0, 1.0)

    def _calculate_semantic_score(self, text: str, points: List[str]) -> float:
        """Calculate semantic relevance score (0-1)"""
        if not points:
            return 0.0
        return min(len(points) / 10.0, 1.0)

    def _extract_regulations(self, text: str) -> List[str]:
        """Extract regulatory references"""
        regulations = []
        keywords = ['gdpr', 'ccpa', 'hipaa', 'sox', 'pci-dss', 'regulation', 'compliance']

        for keyword in keywords:
            if keyword.lower() in text.lower():
                regulations.append(keyword)

        return regulations

    def _extract_entities(self, text: str) -> List[str]:
        """Extract named entities"""
        # Simplified entity extraction
        entities = []
        words = text.split()

        for i, word in enumerate(words):
            if word[0].isupper() and len(word) > 2:
                entities.append(word)

        return list(set(entities))[:10]

    def _generate_legal_summary(self, text: str, points: List[str]) -> str:
        """Generate legal-focused summary"""
        return f"Legal Summary: {len(points)} compliance points identified. Key areas: {', '.join(points[:3])}"

    def _generate_semantic_summary(self, text: str, points: List[str]) -> str:
        """Generate semantic-focused summary"""
        return f"Semantic Summary: {len(points)} semantic markers found. Key meanings: {', '.join(points[:3])}"

    def _generate_hybrid_summary(self, text: str, legal_points: List[str], semantic_points: List[str]) -> str:
        """Generate hybrid S3+S4 summary"""
        return f"Hybrid Summary: Legal ({len(legal_points)} points) + Semantic ({len(semantic_points)} points). Focus: {', '.join((legal_points + semantic_points)[:3])}"

# Singleton instance
_summary_service = None

def get_summary_service() -> S3S4SummaryService:
    """Get or create singleton summary service"""
    global _summary_service
    if _summary_service is None:
        _summary_service = S3S4SummaryService()
    return _summary_service
