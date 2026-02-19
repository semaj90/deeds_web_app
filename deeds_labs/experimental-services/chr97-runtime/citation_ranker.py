#!/usr/bin/env python3
"""
Citation Ranking - Inverse ranking of sentences for CHR97
"""
from typing import List, Dict, Any, Tuple
import numpy as np
import psycopg2

class CitationRanker:
    def __init__(self, db_config: Dict[str, Any]):
        self.db_config = db_config

    def rank_citations_for_rune(
        self,
        case_id: str,
        chunk_index: int,
        query_embedding: List[float],
        chunk_text: str
    ) -> List[Dict[str, Any]]:
        """
        Rank citations by relevance to chunk + query
        Returns: [{"url": str, "kind": "saved"|"search", "relevance": float}, ...]
        """
        conn = psycopg2.connect(**self.db_config)
        cursor = conn.cursor()

        try:
            # Get citations from database
            cursor.execute("""
                SELECT citation_text, relevance_score, is_saved, metadata
                FROM chr97_metadata.citations
                WHERE doc_id LIKE %s
                ORDER BY is_saved DESC, relevance_score DESC
                LIMIT 100
            """, (f"{case_id}%",))

            results = cursor.fetchall()

            citations = []
            for row in results:
                citation_text, relevance_score, is_saved, metadata = row

                citations.append({
                    'url': citation_text,  # Assuming citation_text is URL or identifier
                    'kind': 'saved' if is_saved else 'search',
                    'is_saved': is_saved,
                    'relevance': relevance_score or 0.5
                })

            return citations

        finally:
            cursor.close()
            conn.close()

    def _get_citation_embedding(self, url: str) -> List[float]:
        """Get stored embedding for citation URL"""
        # Would query Qdrant or Redis for citation embeddings
        # For now, return mock embedding
        return np.random.normal(0, 1, 768).tolist()

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Compute cosine similarity"""
        a_arr = np.array(a)
        b_arr = np.array(b)
        return np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr) * np.linalg.norm(b_arr))

    def _compute_chunk_relevance(self, chunk_text: str, citation_url: str) -> float:
        """Compute how relevant citation is to chunk content"""
        # Simple heuristic: check if citation domain appears in text
        # In real implementation, would use semantic similarity
        try:
            from urllib.parse import urlparse
            domain = urlparse(citation_url).netloc.lower()

            # Check for legal domains
            legal_domains = ['supremecourt.gov', 'uscourts.gov', 'justice.gov', 'scholar.google.com']
            if any(d in domain for d in legal_domains):
                return 0.8

            # Check if domain mentioned in text
            if domain in chunk_text.lower():
                return 0.7

            return 0.4  # Default relevance

        except:
            return 0.4

    def get_ranked_citations(self, case_id: str, chunk_index: int) -> List[Dict[str, Any]]:
        """Get pre-computed ranked citations"""
        key = f"citation_rank:{case_id}:{chunk_index}"
        return self.redis.get_json(key) or []

def main():
    """CLI for citation ranking"""
    import sys
    if len(sys.argv) < 4:
        print("Usage: python citation_ranker.py <case_id> <chunk_index> <query_text>")
        sys.exit(1)

    case_id = sys.argv[1]
    chunk_index = int(sys.argv[2])
    query_text = ' '.join(sys.argv[3:])

    ranker = CitationRanker(
        redis_url="redis://localhost:6379",
        qdrant_url="http://localhost:6333"
    )

    # Mock query embedding (would use real embedding service)
    query_emb = np.random.normal(0, 1, 768).tolist()

    # Mock chunk text (would load from actual chunk)
    chunk_text = f"Mock chunk text for {case_id}:{chunk_index}"

    ranked = ranker.rank_citations_for_rune(case_id, chunk_index, query_emb, chunk_text)

    print(f"Ranked citations for {case_id}:{chunk_index}")
    for i, cite in enumerate(ranked):
        print(f"{i+1}. [{cite['kind']}] {cite['url']} (rel: {cite['relevance']:.2f})")

if __name__ == '__main__':
    main()