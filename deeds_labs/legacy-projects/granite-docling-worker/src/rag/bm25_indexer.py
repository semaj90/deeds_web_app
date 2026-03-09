"""
BM25 keyword indexing for legal documents.

Implements BM25 ranking algorithm for keyword-based retrieval.
Target: 1000+ chunks/second indexing throughput.
"""

import logging
import math
from typing import List, Dict, Set, Tuple, Optional
from collections import defaultdict
import json

logger = logging.getLogger(__name__)


class BM25Indexer:
    """
    BM25 keyword indexer for document chunks.

    Implements Okapi BM25 ranking algorithm for keyword-based retrieval.
    """

    # BM25 parameters
    K1 = 1.5  # Term frequency saturation parameter
    B = 0.75  # Length normalization parameter
    K3 = 8.0  # Query term frequency saturation

    # Stop words (common English words to exclude)
    STOP_WORDS = {
        'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
        'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
        'the', 'to', 'was', 'will', 'with', 'this', 'but', 'they', 'have',
        'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how',
    }

    def __init__(self, k1: float = K1, b: float = B, k3: float = K3):
        """
        Initialize BM25 indexer.

        Args:
            k1: Term frequency saturation parameter
            b: Length normalization parameter
            k3: Query term frequency saturation
        """
        self.k1 = k1
        self.b = b
        self.k3 = k3

        # Index data structures
        self.documents: Dict[str, str] = {}  # doc_id -> content
        self.doc_lengths: Dict[str, int] = {}  # doc_id -> length
        self.term_frequencies: Dict[str, Dict[str, int]] = defaultdict(dict)  # term -> {doc_id -> count}
        self.document_frequencies: Dict[str, int] = defaultdict(int)  # term -> count of docs
        self.total_docs = 0
        self.avg_doc_length = 0.0

        logger.info(f"Initialized BM25Indexer (k1={k1}, b={b}, k3={k3})")

    def index_chunks(self, chunks: List[Dict]) -> None:
        """
        Index a batch of chunks.

        Args:
            chunks: List of chunk dicts with 'id' and 'content' keys
        """
        for chunk in chunks:
            self.index_chunk(chunk['id'], chunk['content'])

    def index_chunk(self, chunk_id: str, content: str) -> None:
        """
        Index a single chunk.

        Args:
            chunk_id: Unique chunk identifier
            content: Chunk text content
        """
        # Tokenize and normalize
        tokens = self._tokenize(content)

        # Store document
        self.documents[chunk_id] = content
        self.doc_lengths[chunk_id] = len(tokens)

        # Update term frequencies
        seen_terms = set()
        for token in tokens:
            if token not in self.term_frequencies:
                self.term_frequencies[token] = {}

            if chunk_id not in self.term_frequencies[token]:
                self.term_frequencies[token][chunk_id] = 0

            self.term_frequencies[token][chunk_id] += 1
            seen_terms.add(token)

        # Update document frequencies
        for term in seen_terms:
            self.document_frequencies[term] += 1

        self.total_docs += 1

        # Update average document length
        if self.total_docs > 0:
            self.avg_doc_length = sum(self.doc_lengths.values()) / self.total_docs

    def search(
        self,
        query: str,
        top_k: int = 10,
        min_score: float = 0.0,
    ) -> List[Tuple[str, float]]:
        """
        Search for chunks matching query.

        Args:
            query: Search query
            top_k: Number of top results to return
            min_score: Minimum score threshold

        Returns:
            List of (chunk_id, score) tuples, sorted by score descending
        """
        if not query or self.total_docs == 0:
            return []

        # Tokenize query
        query_tokens = self._tokenize(query)

        # Calculate scores for each document
        scores: Dict[str, float] = defaultdict(float)

        for token in query_tokens:
            if token not in self.term_frequencies:
                continue

            # Calculate IDF (inverse document frequency)
            idf = self._calculate_idf(token)

            # Calculate BM25 score for this term
            for doc_id, term_freq in self.term_frequencies[token].items():
                doc_length = self.doc_lengths[doc_id]

                # BM25 formula
                numerator = term_freq * (self.k1 + 1)
                denominator = (
                    term_freq +
                    self.k1 * (1 - self.b + self.b * (doc_length / self.avg_doc_length))
                )

                bm25_score = idf * (numerator / denominator)
                scores[doc_id] += bm25_score

        # Filter by minimum score and sort
        results = [
            (doc_id, score)
            for doc_id, score in scores.items()
            if score >= min_score
        ]
        results.sort(key=lambda x: x[1], reverse=True)

        return results[:top_k]

    def _tokenize(self, text: str) -> List[str]:
        """
        Tokenize and normalize text.

        Args:
            text: Text to tokenize

        Returns:
            List of normalized tokens
        """
        # Convert to lowercase
        text = text.lower()

        # Split on whitespace and punctuation
        import re
        tokens = re.findall(r'\b\w+\b', text)

        # Remove stop words and short tokens
        tokens = [
            t for t in tokens
            if t not in self.STOP_WORDS and len(t) > 2
        ]

        return tokens

    def _calculate_idf(self, term: str) -> float:
        """
        Calculate IDF (inverse document frequency) for a term.

        Args:
            term: Term to calculate IDF for

        Returns:
            IDF score
        """
        if term not in self.document_frequencies:
            return 0.0

        doc_freq = self.document_frequencies[term]

        # IDF formula: log((N - df + 0.5) / (df + 0.5))
        idf = math.log(
            (self.total_docs - doc_freq + 0.5) / (doc_freq + 0.5)
        )

        return max(0.0, idf)

    def get_statistics(self) -> Dict:
        """Get indexing statistics."""
        return {
            'total_documents': self.total_docs,
            'total_terms': len(self.term_frequencies),
            'average_doc_length': self.avg_doc_length,
            'index_size_bytes': self._estimate_size(),
        }

    def _estimate_size(self) -> int:
        """Estimate index size in bytes."""
        size = 0
        for term, docs in self.term_frequencies.items():
            size += len(term) + len(docs) * 8  # term + doc_id/count pairs
        return size

    def save_index(self, filepath: str) -> None:
        """Save index to file."""
        index_data = {
            'documents': self.documents,
            'doc_lengths': self.doc_lengths,
            'term_frequencies': {
                term: dict(docs)
                for term, docs in self.term_frequencies.items()
            },
            'document_frequencies': dict(self.document_frequencies),
            'total_docs': self.total_docs,
            'avg_doc_length': self.avg_doc_length,
        }

        with open(filepath, 'w') as f:
            json.dump(index_data, f)

        logger.info(f"Saved BM25 index to {filepath}")

    def load_index(self, filepath: str) -> None:
        """Load index from file."""
        with open(filepath, 'r') as f:
            index_data = json.load(f)

        self.documents = index_data['documents']
        self.doc_lengths = index_data['doc_lengths']
        self.term_frequencies = defaultdict(dict)
        for term, docs in index_data['term_frequencies'].items():
            self.term_frequencies[term] = docs
        self.document_frequencies = defaultdict(int)
        for term, count in index_data['document_frequencies'].items():
            self.document_frequencies[term] = count
        self.total_docs = index_data['total_docs']
        self.avg_doc_length = index_data['avg_doc_length']

        logger.info(f"Loaded BM25 index from {filepath}")
