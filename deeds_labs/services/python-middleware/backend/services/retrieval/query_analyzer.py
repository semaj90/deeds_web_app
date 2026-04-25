"""Query analyzer for multi-source retrieval topology."""

import re
from datetime import datetime
from typing import List

from .models import QueryProfile, RoutingStrategy


class QueryAnalyzer:
    """Analyzes queries and determines optimal routing strategy."""

    # Keywords for intent detection
    LEGAL_KEYWORDS = {
        "contract",
        "agreement",
        "clause",
        "legal",
        "law",
        "statute",
        "regulation",
        "compliance",
        "liability",
        "patent",
        "trademark",
        "copyright",
        "intellectual property",
    }

    TEMPORAL_KEYWORDS = {
        "when",
        "date",
        "time",
        "year",
        "month",
        "day",
        "before",
        "after",
        "during",
        "since",
        "until",
        "historical",
        "timeline",
    }

    RECENT_KEYWORDS = {
        "latest",
        "recent",
        "new",
        "breaking",
        "today",
        "yesterday",
        "this week",
        "this month",
        "current",
        "now",
    }

    def __init__(self):
        """Initialize QueryAnalyzer."""
        self.legal_pattern = re.compile(
            "|".join(self.LEGAL_KEYWORDS), re.IGNORECASE
        )
        self.temporal_pattern = re.compile(
            "|".join(self.TEMPORAL_KEYWORDS), re.IGNORECASE
        )
        self.recent_pattern = re.compile(
            "|".join(self.RECENT_KEYWORDS), re.IGNORECASE
        )

    def analyze_query(self, query: str) -> QueryProfile:
        """Analyze query and return profile.

        Args:
            query: The query string to analyze

        Returns:
            QueryProfile with detected intent, entities, and preferences
        """
        intent = self._detect_intent(query)
        entities = self._extract_entities(query)
        temporal_refs = self._detect_temporal_references(query)
        source_preferences = self._determine_source_preferences(intent)
        requires_visual_search = self._detect_visual_intent(query)
        requires_citations = self._detect_citation_intent(query)

        return QueryProfile(
            query=query,
            intent=intent,
            entities=entities,
            temporal_refs=temporal_refs,
            confidence_threshold=self._get_confidence_threshold(intent),
            source_preferences=source_preferences,
            timestamp=datetime.now(),
            requires_visual_search=requires_visual_search,
            requires_citations=requires_citations,
        )

    def route_query(self, profile: QueryProfile) -> RoutingStrategy:
        """Generate routing strategy based on query profile.

        Args:
            profile: The analyzed query profile

        Returns:
            RoutingStrategy with source selection and order
        """
        if profile.intent == "legal":
            return RoutingStrategy(
                primary_sources=["legal_rag_plus_kag", "postgresql_summaries"],
                secondary_sources=["wikipedia", "google_search"],
                fallback_sources=["general_web", "web_search_with_reembed"],
                parallel_execution=True,
                timeout_per_source=30,
                min_results_threshold=1,
            )
        elif profile.intent == "temporal":
            return RoutingStrategy(
                primary_sources=["graph_4d_topology"],
                secondary_sources=["postgresql_summaries", "google_search"],
                fallback_sources=["wikipedia", "general_web"],
                parallel_execution=False,
                timeout_per_source=30,
                min_results_threshold=1,
            )
        elif profile.intent == "recent":
            return RoutingStrategy(
                primary_sources=["google_search"],
                secondary_sources=["general_web", "wikipedia"],
                fallback_sources=["postgresql_summaries"],
                parallel_execution=True,
                timeout_per_source=30,
                min_results_threshold=1,
            )
        else:  # general
            return RoutingStrategy(
                primary_sources=["wikipedia", "google_search"],
                secondary_sources=["postgresql_summaries"],
                fallback_sources=["general_web", "web_search_with_reembed"],
                parallel_execution=True,
                timeout_per_source=30,
                min_results_threshold=1,
            )

    def _detect_intent(self, query: str) -> str:
        """Detect query intent."""
        query_lower = query.lower()

        if self.legal_pattern.search(query_lower):
            return "legal"
        elif self.temporal_pattern.search(query_lower):
            return "temporal"
        elif self.recent_pattern.search(query_lower):
            return "recent"
        else:
            return "general"

    def _extract_entities(self, query: str) -> List[str]:
        """Extract entities from query using simple keyword matching."""
        # Simple entity extraction - can be enhanced with NER
        entities = []

        # Extract capitalized words as potential entities
        words = query.split()
        for word in words:
            if word and word[0].isupper() and len(word) > 2:
                entities.append(word)

        return entities

    def _detect_temporal_references(self, query: str) -> List[str]:
        """Detect temporal references in query."""
        temporal_refs = []

        # Simple temporal reference detection
        temporal_patterns = [
            r"\d{4}",  # Years
            r"\d{1,2}/\d{1,2}/\d{4}",  # Dates
            r"(January|February|March|April|May|June|July|August|September|October|November|December)",
        ]

        for pattern in temporal_patterns:
            matches = re.findall(pattern, query, re.IGNORECASE)
            temporal_refs.extend(matches)

        return temporal_refs if temporal_refs else None

    def _determine_source_preferences(self, intent: str) -> List[str]:
        """Determine source preferences based on intent."""
        preferences = {
            "legal": [
                "legal_rag_plus_kag",
                "postgresql_summaries",
                "google_search",
            ],
            "temporal": ["graph_4d_topology", "google_search", "wikipedia"],
            "recent": ["google_search", "general_web", "wikipedia"],
            "general": ["wikipedia", "google_search", "postgresql_summaries"],
        }
        return preferences.get(intent, preferences["general"])

    def _get_confidence_threshold(self, intent: str) -> float:
        """Get confidence threshold based on intent."""
        thresholds = {
            "legal": 0.8,  # High threshold for legal queries
            "temporal": 0.7,
            "recent": 0.6,  # Lower threshold for recent queries
            "general": 0.5,
        }
        return thresholds.get(intent, 0.5)

    def _detect_visual_intent(self, query: str) -> bool:
        """Detect if query requires visual search."""
        visual_keywords = {
            "image",
            "picture",
            "photo",
            "visual",
            "diagram",
            "chart",
            "graph",
            "screenshot",
            "look like",
            "appears",
        }
        query_lower = query.lower()
        return any(keyword in query_lower for keyword in visual_keywords)

    def _detect_citation_intent(self, query: str) -> bool:
        """Detect if query requires citation tracking."""
        citation_keywords = {
            "source",
            "cite",
            "citation",
            "reference",
            "where",
            "from",
            "evidence",
            "proof",
        }
        query_lower = query.lower()
        return any(keyword in query_lower for keyword in citation_keywords)
