"""
Multi-Modal Feature Vector for RL/QLoRA Phase Scorer

Combines:
- LLM text state (Gemma3-legal)
- VLM/LangExtract (document layout)
- Web/RAG quality signals
- Tool-call telemetry (FastMCP)
- Phase/AST/Error graph (ts-morph)
- Legal context flags
- Runtime/engine performance (TRT-LLM)

Total: 1024 dimensions
"""

import numpy as np
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from collections import Counter
import logging

logger = logging.getLogger(__name__)


@dataclass
class FeatureVectorConfig:
    """Configuration for feature vector dimensions."""
    llm_text_dims: int = 256
    vlm_layout_dims: int = 128
    web_rag_dims: int = 128
    tool_telemetry_dims: int = 128
    phase_ast_dims: int = 192
    legal_flags_dims: int = 96
    runtime_perf_dims: int = 96

    @property
    def total_dims(self) -> int:
        return (
            self.llm_text_dims +
            self.vlm_layout_dims +
            self.web_rag_dims +
            self.tool_telemetry_dims +
            self.phase_ast_dims +
            self.legal_flags_dims +
            self.runtime_perf_dims
        )


class MultiModalFeatureExtractor:
    """
    Extracts 1024-d feature vector from multi-modal signals.

    Feature Layout:
    ┌─────────────────────────────────────────────────────────┐
    │ Block A: LLM Text State           (256d)               │
    │ Block B: VLM/LangExtract          (128d)               │
    │ Block C: Web/RAG Quality          (128d)               │
    │ Block D: Tool-Call Telemetry      (128d)               │
    │ Block E: Phase/AST/Error Graph    (192d)               │
    │ Block F: Legal Context Flags      (96d)                │
    │ Block G: Runtime/Engine Perf      (96d)                │
    └─────────────────────────────────────────────────────────┘
    Total: 1024 dimensions
    """

    def __init__(self, config: Optional[FeatureVectorConfig] = None):
        self.config = config or FeatureVectorConfig()
        logger.info(f"Initialized MultiModalFeatureExtractor: {self.config.total_dims}d")

    def extract(
        self,
        llm_state: Optional[Dict[str, Any]] = None,
        vlm_state: Optional[Dict[str, Any]] = None,
        web_rag_state: Optional[Dict[str, Any]] = None,
        tool_state: Optional[Dict[str, Any]] = None,
        phase_ast_state: Optional[Dict[str, Any]] = None,
        legal_state: Optional[Dict[str, Any]] = None,
        runtime_state: Optional[Dict[str, Any]] = None,
    ) -> np.ndarray:
        """
        Extract complete 1024-d feature vector.

        Args:
            llm_state: Gemma3-legal hidden states, logprobs, etc.
            vlm_state: VLM/LangExtract document layout signals
            web_rag_state: Web search + RAG retrieval quality
            tool_state: FastMCP tool call telemetry
            phase_ast_state: ts-morph AST + error graph
            legal_state: Legal context (jurisdiction, statutes, etc.)
            runtime_state: TRT-LLM performance metrics

        Returns:
            1024-d numpy array (float32)
        """
        blocks = []

        # Block A: LLM Text State (256d)
        blocks.append(self._extract_llm_text_state(llm_state or {}))

        # Block B: VLM/LangExtract (128d)
        blocks.append(self._extract_vlm_layout_state(vlm_state or {}))

        # Block C: Web/RAG Quality (128d)
        blocks.append(self._extract_web_rag_state(web_rag_state or {}))

        # Block D: Tool-Call Telemetry (128d)
        blocks.append(self._extract_tool_telemetry(tool_state or {}))

        # Block E: Phase/AST/Error Graph (192d)
        blocks.append(self._extract_phase_ast_state(phase_ast_state or {}))

        # Block F: Legal Context Flags (96d)
        blocks.append(self._extract_legal_flags(legal_state or {}))

        # Block G: Runtime/Engine Perf (96d)
        blocks.append(self._extract_runtime_perf(runtime_state or {}))

        # Concatenate all blocks
        feature_vector = np.concatenate(blocks, axis=0).astype(np.float32)

        assert feature_vector.shape[0] == self.config.total_dims, \
            f"Feature vector size mismatch: {feature_vector.shape[0]} != {self.config.total_dims}"

        return feature_vector

    # ========================================================================
    # Block A: LLM Text State (256d)
    # ========================================================================

    def _extract_llm_text_state(self, state: Dict[str, Any]) -> np.ndarray:
        """
        Extract LLM text state from Gemma3-legal.

        Dimensions:
        - 0-127: Pooled hidden state (mean of last layer)
        - 128-191: Logprob statistics
        - 192-223: Confidence metrics
        - 224-255: Token-level features

        Args:
            state: {
                'hidden_states': np.ndarray,  # [seq_len, hidden_dim]
                'logprobs': List[float],
                'tokens': List[str],
                'attention_weights': np.ndarray,  # optional
            }

        Returns:
            256-d numpy array
        """
        features = []

        # 0-127: Pooled hidden state (128d projection)
        if 'hidden_states' in state and state['hidden_states'] is not None:
            hidden = state['hidden_states']
            if len(hidden.shape) == 2:  # [seq_len, hidden_dim]
                # Mean pooling over sequence
                pooled = np.mean(hidden, axis=0)
                # Project to 128d (simple truncation or learned projection)
                pooled_128 = pooled[:128] if len(pooled) >= 128 else np.pad(pooled, (0, 128 - len(pooled)))
                features.append(pooled_128)
            else:
                features.append(np.zeros(128))
        else:
            features.append(np.zeros(128))

        # 128-191: Logprob statistics (64d)
        logprob_feats = np.zeros(64)
        if 'logprobs' in state and state['logprobs']:
            logprobs = np.array(state['logprobs'])
            logprob_feats[0] = np.mean(logprobs)  # mean logprob
            logprob_feats[1] = np.std(logprobs)   # std logprob
            logprob_feats[2] = np.min(logprobs)   # min logprob
            logprob_feats[3] = np.max(logprobs)   # max logprob
            logprob_feats[4] = np.median(logprobs)  # median logprob

            # Last 32 tokens statistics
            if len(logprobs) >= 32:
                last_32 = logprobs[-32:]
                logprob_feats[5] = np.mean(last_32)
                logprob_feats[6] = np.std(last_32)
                logprob_feats[7] = (last_32 < -2.0).mean()  # fraction low confidence

            # Entropy approximation
            logprob_feats[8] = -np.mean(logprobs * np.exp(logprobs))  # H ≈ -Σ p log p

        features.append(logprob_feats)

        # 192-223: Confidence metrics (32d)
        confidence_feats = np.zeros(32)
        if 'logprobs' in state and state['logprobs']:
            logprobs = np.array(state['logprobs'])
            # Confidence thresholds
            confidence_feats[0] = (logprobs > -0.5).mean()  # very confident
            confidence_feats[1] = (logprobs > -1.0).mean()  # confident
            confidence_feats[2] = (logprobs > -2.0).mean()  # moderate
            confidence_feats[3] = (logprobs < -5.0).mean()  # very uncertain

            # Confidence trajectory (last 16 tokens)
            if len(logprobs) >= 16:
                for i in range(16):
                    confidence_feats[4 + i] = logprobs[-(16-i)] if len(logprobs) > (16-i) else 0.0

        features.append(confidence_feats)

        # 224-255: Token-level features (32d)
        token_feats = np.zeros(32)
        if 'tokens' in state and state['tokens']:
            tokens = state['tokens']
            token_feats[0] = len(tokens)  # total tokens
            token_feats[1] = len(set(tokens))  # unique tokens
            token_feats[2] = len(set(tokens)) / max(len(tokens), 1)  # diversity

            # Special token counts
            token_feats[3] = sum(1 for t in tokens if t.startswith('▁'))  # word boundaries
            token_feats[4] = sum(1 for t in tokens if t.isupper())  # uppercase
            token_feats[5] = sum(1 for t in tokens if t.isdigit())  # digits

        features.append(token_feats)

        return np.concatenate(features)

    # ========================================================================
    # Block B: VLM/LangExtract (128d)
    # ========================================================================

    def _extract_vlm_layout_state(self, state: Dict[str, Any]) -> np.ndarray:
        """
        Extract VLM/LangExtract document layout signals.

        Dimensions:
        - 0-15: Document structure
        - 16-31: Block roles
        - 32-63: Visual embedding (projected)
        - 64-127: LangExtract entity counts

        Args:
            state: {
                'page_count': int,
                'words_per_page': float,
                'tables_per_page': float,
                'images_per_page': float,
                'has_signatures': bool,
                'block_roles': Dict[str, float],  # {'header': 0.1, 'body': 0.8, ...}
                'visual_embedding': np.ndarray,  # [embedding_dim]
                'entities': Dict[str, int],  # {'PERSON': 5, 'ORG': 3, ...}
                'document_type_probs': Dict[str, float],  # {'contract': 0.8, ...}
            }

        Returns:
            128-d numpy array
        """
        features = []

        # 0-15: Document structure (16d)
        doc_struct = np.zeros(16)
        doc_struct[0] = np.log1p(state.get('page_count', 0))
        doc_struct[1] = state.get('words_per_page', 0) / 500.0  # normalize
        doc_struct[2] = state.get('tables_per_page', 0)
        doc_struct[3] = state.get('images_per_page', 0)
        doc_struct[4] = float(state.get('has_signatures', False))
        doc_struct[5] = float(state.get('has_seals', False))
        doc_struct[6] = float(state.get('has_exhibits', False))
        doc_struct[7] = float(state.get('has_annexes', False))
        features.append(doc_struct)

        # 16-31: Block roles (16d)
        block_roles = np.zeros(16)
        roles = state.get('block_roles', {})
        block_roles[0] = roles.get('header', 0.0)
        block_roles[1] = roles.get('body', 0.0)
        block_roles[2] = roles.get('footnote', 0.0)
        block_roles[3] = roles.get('title', 0.0)
        block_roles[4] = roles.get('caption', 0.0)
        block_roles[5] = roles.get('list', 0.0)
        block_roles[6] = roles.get('table', 0.0)
        block_roles[7] = roles.get('figure', 0.0)
        features.append(block_roles)

        # 32-63: Visual embedding (32d projection)
        if 'visual_embedding' in state and state['visual_embedding'] is not None:
            vis_emb = state['visual_embedding']
            # Project to 32d (truncate or pad)
            vis_32 = vis_emb[:32] if len(vis_emb) >= 32 else np.pad(vis_emb, (0, 32 - len(vis_emb)))
            features.append(vis_32)
        else:
            features.append(np.zeros(32))

        # 64-127: LangExtract entity counts (64d)
        entity_feats = np.zeros(64)
        entities = state.get('entities', {})

        # Entity type counts (z-scored)
        entity_feats[0] = np.log1p(entities.get('PERSON', 0))
        entity_feats[1] = np.log1p(entities.get('ORG', 0))
        entity_feats[2] = np.log1p(entities.get('LOCATION', 0))
        entity_feats[3] = np.log1p(entities.get('MONEY', 0))
        entity_feats[4] = np.log1p(entities.get('DATE', 0))
        entity_feats[5] = np.log1p(entities.get('TIME', 0))
        entity_feats[6] = np.log1p(entities.get('PERCENT', 0))
        entity_feats[7] = np.log1p(entities.get('QUANTITY', 0))

        # Legal-specific entities
        entity_feats[8] = float(entities.get('children_coded', False))
        entity_feats[9] = entities.get('minor_victim_prob', 0.0)
        entity_feats[10] = float(entities.get('cps_report', False))

        # Document type probabilities
        doc_types = state.get('document_type_probs', {})
        entity_feats[11] = doc_types.get('contract', 0.0)
        entity_feats[12] = doc_types.get('statute', 0.0)
        entity_feats[13] = doc_types.get('court_order', 0.0)
        entity_feats[14] = doc_types.get('cps_report', 0.0)
        entity_feats[15] = doc_types.get('legal_brief', 0.0)

        features.append(entity_feats)

        return np.concatenate(features)

    # ========================================================================
    # Block C: Web/RAG Quality (128d)
    # ========================================================================

    def _extract_web_rag_state(self, state: Dict[str, Any]) -> np.ndarray:
        """
        Extract Web/RAG quality signals.

        Dimensions:
        - 0-15: Top-k scores
        - 16-31: Diversity metrics
        - 32-47: Coverage vs query
        - 48-63: Citation quality
        - 64-127: Compact RAG context embedding

        Args:
            state: {
                'top_k_scores': List[float],  # BM25 or embedding scores
                'top_k_domains': List[str],
                'query_terms': List[str],
                'retrieved_snippets': List[str],
                'citation_matches': int,
                'rag_context_embedding': np.ndarray,
            }

        Returns:
            128-d numpy array
        """
        features = []

        # 0-15: Top-k scores (16d)
        score_feats = np.zeros(16)
        scores = state.get('top_k_scores', [])
        if scores:
            score_feats[0] = scores[0] if len(scores) > 0 else 0.0  # top1
            score_feats[1] = np.mean(scores[:5]) if len(scores) >= 5 else 0.0  # avg top5
            score_feats[2] = np.mean(scores[:10]) if len(scores) >= 10 else 0.0  # avg top10
            score_feats[3] = np.std(scores[:10]) if len(scores) >= 10 else 0.0  # std top10
            score_feats[4] = np.min(scores) if scores else 0.0
            score_feats[5] = np.max(scores) if scores else 0.0
        features.append(score_feats)

        # 16-31: Diversity metrics (16d)
        diversity_feats = np.zeros(16)
        domains = state.get('top_k_domains', [])
        if domains:
            diversity_feats[0] = len(set(domains)) / max(len(domains), 1)  # domain diversity
            diversity_feats[1] = len(set(domains))  # unique domains
        features.append(diversity_feats)

        # 32-47: Coverage vs query (16d)
        coverage_feats = np.zeros(16)
        query_terms = set(state.get('query_terms', []))
        snippets = state.get('retrieved_snippets', [])
        if query_terms and snippets:
            snippet_text = ' '.join(snippets).lower()
            covered = sum(1 for term in query_terms if term.lower() in snippet_text)
            coverage_feats[0] = covered / max(len(query_terms), 1)  # coverage ratio
            coverage_feats[1] = covered  # absolute coverage
        features.append(coverage_feats)

        # 48-63: Citation quality (16d)
        citation_feats = np.zeros(16)
        citation_feats[0] = state.get('citation_matches', 0)
        citation_feats[1] = state.get('statute_matches', 0)
        citation_feats[2] = state.get('case_law_matches', 0)
        features.append(citation_feats)

        # 64-127: Compact RAG context embedding (64d)
        if 'rag_context_embedding' in state and state['rag_context_embedding'] is not None:
            rag_emb = state['rag_context_embedding']
            rag_64 = rag_emb[:64] if len(rag_emb) >= 64 else np.pad(rag_emb, (0, 64 - len(rag_emb)))
            features.append(rag_64)
        else:
            features.append(np.zeros(64))

        return np.concatenate(features)

    # ========================================================================
    # Block D: Tool-Call Telemetry (128d)
    # ========================================================================

    def _extract_tool_telemetry(self, state: Dict[str, Any]) -> np.ndarray:
        """
        Extract FastMCP tool call telemetry.

        Dimensions:
        - 0-15: Tool usage counts
        - 16-31: Success/failure rates
        - 32-47: Latency statistics
        - 48-63: Tool graph (bigrams)
        - 64-127: Tool-program embedding

        Args:
            state: {
                'tool_calls': List[Dict],  # [{'name': 'web_search', 'success': True, 'latency_ms': 150}, ...]
                'tool_sequence': List[str],  # ['web_search', 'extract_citations', ...]
                'tool_program_embedding': np.ndarray,
            }

        Returns:
            128-d numpy array
        """
        features = []

        # 0-15: Tool usage counts (16d)
        usage_feats = np.zeros(16)
        tool_calls = state.get('tool_calls', [])
        tool_counts = Counter(call['name'] for call in tool_calls)

        usage_feats[0] = tool_counts.get('web_search', 0)
        usage_feats[1] = tool_counts.get('scrape_url', 0)
        usage_feats[2] = tool_counts.get('extract_citations', 0)
        usage_feats[3] = tool_counts.get('analyze_with_gemma', 0)
        usage_feats[4] = tool_counts.get('classify_document', 0)
        usage_feats[5] = tool_counts.get('analyze_citation_network', 0)
        usage_feats[6] = len(tool_calls)  # total calls
        features.append(usage_feats)

        # 16-31: Success/failure rates (16d)
        success_feats = np.zeros(16)
        if tool_calls:
            successes = sum(1 for call in tool_calls if call.get('success', False))
            success_feats[0] = successes / len(tool_calls)  # success rate
            success_feats[1] = (len(tool_calls) - successes) / len(tool_calls)  # failure rate

            # Per-tool success rates
            for i, tool_name in enumerate(['web_search', 'scrape_url', 'extract_citations']):
                tool_specific = [c for c in tool_calls if c['name'] == tool_name]
                if tool_specific:
                    tool_successes = sum(1 for c in tool_specific if c.get('success', False))
                    success_feats[2 + i] = tool_successes / len(tool_specific)
        features.append(success_feats)

        # 32-47: Latency statistics (16d)
        latency_feats = np.zeros(16)
        if tool_calls:
            latencies = [call.get('latency_ms', 0) for call in tool_calls]
            latency_feats[0] = np.mean(latencies)
            latency_feats[1] = np.median(latencies)
            latency_feats[2] = np.percentile(latencies, 95) if latencies else 0.0
            latency_feats[3] = np.max(latencies) if latencies else 0.0
        features.append(latency_feats)

        # 48-63: Tool graph bigrams (16d)
        graph_feats = np.zeros(16)
        tool_seq = state.get('tool_sequence', [])
        if len(tool_seq) >= 2:
            bigrams = Counter(zip(tool_seq[:-1], tool_seq[1:]))
            # Encode top bigrams
            graph_feats[0] = bigrams.get(('web_search', 'extract_citations'), 0)
            graph_feats[1] = bigrams.get(('extract_citations', 'analyze_with_gemma'), 0)
            graph_feats[2] = bigrams.get(('scrape_url', 'extract_citations'), 0)
        features.append(graph_feats)

        # 64-127: Tool-program embedding (64d)
        if 'tool_program_embedding' in state and state['tool_program_embedding'] is not None:
            prog_emb = state['tool_program_embedding']
            prog_64 = prog_emb[:64] if len(prog_emb) >= 64 else np.pad(prog_emb, (0, 64 - len(prog_emb)))
            features.append(prog_64)
        else:
            features.append(np.zeros(64))

        return np.concatenate(features)

    # ========================================================================
    # Block E: Phase/AST/Error Graph (192d)
    # ========================================================================

    def _extract_phase_ast_state(self, state: Dict[str, Any]) -> np.ndarray:
        """
        Extract Phase/AST/Error graph from ts-morph.

        Dimensions:
        - 0-31: AST structure stats
        - 32-63: Error distribution
        - 64-95: Graph centrality
        - 96-127: Phase state
        - 128-191: Graph embedding

        Args:
            state: {
                'ast_stats': Dict,  # {'avg_depth': 5.2, 'max_depth': 12, ...}
                'error_counts': Dict[str, int],  # {'TS1005': 150, 'TS2741': 45, ...}
                'errors_per_file': Dict[str, int],
                'phase_id': str,  # 'phase26', 'phase52', etc.
                'retry_count': int,
                'time_in_phase_sec': float,
                'graph_embedding': np.ndarray,
            }

        Returns:
            192-d numpy array
        """
        features = []

        # 0-31: AST structure stats (32d)
        ast_feats = np.zeros(32)
        ast_stats = state.get('ast_stats', {})
        ast_feats[0] = ast_stats.get('avg_depth', 0.0)
        ast_feats[1] = ast_stats.get('max_depth', 0.0)
        ast_feats[2] = ast_stats.get('num_functions', 0.0)
        ast_feats[3] = ast_stats.get('num_components', 0.0)
        ast_feats[4] = ast_stats.get('num_imports', 0.0)
        ast_feats[5] = ast_stats.get('num_exports', 0.0)
        ast_feats[6] = ast_stats.get('num_generics', 0.0)
        ast_feats[7] = ast_stats.get('num_interfaces', 0.0)
        features.append(ast_feats)

        # 32-63: Error distribution (32d)
        error_feats = np.zeros(32)
        error_counts = state.get('error_counts', {})

        # Top error codes (from CODEBASE_ANALYSIS_REPORT.md)
        error_feats[0] = np.log1p(error_counts.get('TS1005', 0))  # ',' expected
        error_feats[1] = np.log1p(error_counts.get('TS1128', 0))  # Declaration expected
        error_feats[2] = np.log1p(error_counts.get('TS1434', 0))  # Unexpected keyword
        error_feats[3] = np.log1p(error_counts.get('TS1109', 0))  # Expression expected
        error_feats[4] = np.log1p(error_counts.get('TS2741', 0))  # Property missing
        error_feats[5] = np.log1p(error_counts.get('TS2345', 0))  # Argument type mismatch

        # Total errors
        error_feats[6] = np.log1p(sum(error_counts.values()))
        error_feats[7] = len(error_counts)  # unique error types
        features.append(error_feats)

        # 64-95: Graph centrality (32d)
        centrality_feats = np.zeros(32)
        errors_per_file = state.get('errors_per_file', {})
        if errors_per_file:
            error_values = list(errors_per_file.values())
            centrality_feats[0] = np.mean(error_values)
            centrality_feats[1] = np.std(error_values)
            centrality_feats[2] = np.max(error_values)
            centrality_feats[3] = len(errors_per_file)  # num files with errors

            # Check for errors in critical files
            centrality_feats[4] = errors_per_file.get('src/routes/+layout.svelte', 0)
            centrality_feats[5] = errors_per_file.get('src/app.html', 0)
        features.append(centrality_feats)

        # 96-127: Phase state (32d)
        phase_feats = np.zeros(32)

        # One-hot encoding for phases (simplified)
        phase_map = {'phase26': 0, 'phase52': 1, 'phase70': 2, 'phase74': 3}
        phase_id = state.get('phase_id', '')
        if phase_id in phase_map:
            phase_feats[phase_map[phase_id]] = 1.0

        phase_feats[10] = state.get('retry_count', 0)
        phase_feats[11] = np.log1p(state.get('time_in_phase_sec', 0))
        features.append(phase_feats)

        # 128-191: Graph embedding (64d)
        if 'graph_embedding' in state and state['graph_embedding'] is not None:
            graph_emb = state['graph_embedding']
            graph_64 = graph_emb[:64] if len(graph_emb) >= 64 else np.pad(graph_emb, (0, 64 - len(graph_emb)))
            features.append(graph_64)
        else:
            features.append(np.zeros(64))

        return np.concatenate(features)

    # ========================================================================
    # Block F: Legal Context Flags (96d)
    # ========================================================================

    def _extract_legal_flags(self, state: Dict[str, Any]) -> np.ndarray:
        """
        Extract legal context flags.

        Dimensions:
        - 0-31: Jurisdiction flags
        - 32-63: Topic clusters
        - 64-95: Statute/citation density

        Args:
            state: {
                'jurisdiction': str,  # 'CA', 'Federal', etc.
                'topics': List[str],  # ['labor', 'criminal', 'family']
                'statute_density': float,  # citations per 1000 words
                'citation_types': Dict[str, int],  # {'ca_const': 5, 'case_law': 12}
            }

        Returns:
            96-d numpy array
        """
        features = []

        # 0-31: Jurisdiction flags (32d)
        jurisdiction_feats = np.zeros(32)
        jurisdiction = state.get('jurisdiction', '')
        jurisdiction_feats[0] = float(jurisdiction == 'CA')
        jurisdiction_feats[1] = float(jurisdiction == 'Federal')
        jurisdiction_feats[2] = float(jurisdiction == 'NY')
        jurisdiction_feats[3] = float(jurisdiction == 'TX')
        features.append(jurisdiction_feats)

        # 32-63: Topic clusters (32d)
        topic_feats = np.zeros(32)
        topics = state.get('topics', [])
        topic_feats[0] = float('labor' in topics)
        topic_feats[1] = float('criminal' in topics)
        topic_feats[2] = float('family' in topics)
        topic_feats[3] = float('contract' in topics)
        topic_feats[4] = float('constitutional' in topics)
        features.append(topic_feats)

        # 64-95: Statute/citation density (32d)
        citation_feats = np.zeros(32)
        citation_feats[0] = state.get('statute_density', 0.0)

        citation_types = state.get('citation_types', {})
        citation_feats[1] = citation_types.get('ca_const', 0)
        citation_feats[2] = citation_types.get('ca_penal', 0)
        citation_feats[3] = citation_types.get('ca_labor', 0)
        citation_feats[4] = citation_types.get('case_law', 0)
        citation_feats[5] = citation_types.get('us_statute', 0)
        features.append(citation_feats)

        return np.concatenate(features)

    # ========================================================================
    # Block G: Runtime/Engine Performance (96d)
    # ========================================================================

    def _extract_runtime_perf(self, state: Dict[str, Any]) -> np.ndarray:
        """
        Extract runtime/engine performance metrics.

        Dimensions:
        - 0-31: TRT-LLM performance
        - 32-63: Token throughput
        - 64-95: Latency budget

        Args:
            state: {
                'engine': str,  # 'ollama', 'tensorrt', 'vllm'
                'tokens_per_sec': float,
                'latency_ms': float,
                'gpu_utilization': float,
                'memory_used_gb': float,
            }

        Returns:
            96-d numpy array
        """
        features = []

        # 0-31: TRT-LLM performance (32d)
        engine_feats = np.zeros(32)
        engine = state.get('engine', 'ollama')
        engine_feats[0] = float(engine == 'ollama')
        engine_feats[1] = float(engine == 'tensorrt')
        engine_feats[2] = float(engine == 'vllm')

        engine_feats[3] = state.get('gpu_utilization', 0.0)
        engine_feats[4] = state.get('memory_used_gb', 0.0)
        features.append(engine_feats)

        # 32-63: Token throughput (32d)
        throughput_feats = np.zeros(32)
        throughput_feats[0] = state.get('tokens_per_sec', 0.0)
        throughput_feats[1] = np.log1p(state.get('tokens_per_sec', 0.0))
        features.append(throughput_feats)

        # 64-95: Latency budget (32d)
        latency_feats = np.zeros(32)
        latency_feats[0] = state.get('latency_ms', 0.0)
        latency_feats[1] = np.log1p(state.get('latency_ms', 0.0))
        features.append(latency_feats)

        return np.concatenate(features)


# ============================================================================
# Example Usage
# ============================================================================

if __name__ == "__main__":
    # Create extractor
    extractor = MultiModalFeatureExtractor()

    # Example states (normally from real data)
    example_llm_state = {
        'hidden_states': np.random.randn(32, 256),  # [seq_len, hidden_dim]
        'logprobs': [-0.5, -1.2, -0.8, -2.1] * 8,
        'tokens': ['▁The', '▁contract', '▁states', '...'] * 8,
    }

    example_vlm_state = {
        'page_count': 5,
        'words_per_page': 450.0,
        'has_signatures': True,
        'block_roles': {'header': 0.1, 'body': 0.8, 'footnote': 0.1},
        'entities': {'PERSON': 3, 'ORG': 2, 'MONEY': 5},
        'document_type_probs': {'contract': 0.9, 'statute': 0.1},
    }

    example_tool_state = {
        'tool_calls': [
            {'name': 'web_search', 'success': True, 'latency_ms': 150},
            {'name': 'extract_citations', 'success': True, 'latency_ms': 50},
        ],
        'tool_sequence': ['web_search', 'extract_citations', 'analyze_with_gemma'],
    }

    example_phase_state = {
        'ast_stats': {'avg_depth': 5.2, 'num_functions': 120},
        'error_counts': {'TS1005': 150, 'TS2741': 45},
        'phase_id': 'phase26',
        'retry_count': 2,
    }

    # Extract feature vector
    feature_vector = extractor.extract(
        llm_state=example_llm_state,
        vlm_state=example_vlm_state,
        tool_state=example_tool_state,
        phase_ast_state=example_phase_state,
    )

    print(f"Feature vector shape: {feature_vector.shape}")
    print(f"Feature vector dtype: {feature_vector.dtype}")
    print(f"Feature vector range: [{feature_vector.min():.3f}, {feature_vector.max():.3f}]")
    print(f"\nFirst 10 dims: {feature_vector[:10]}")
