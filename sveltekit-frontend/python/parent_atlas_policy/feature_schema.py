POLICY_FEATURES = [
    'okf_naive_bayes', 'okf_logistic', 'okf_margin', 'okf_review_or_abstain',
    'hmm_locate', 'hmm_understand', 'hmm_trace', 'hmm_repair', 'hmm_validate', 'hmm_recover',
    'best_cosine', 'cosine_margin', 'lexical_hit_count', 'rrf_confidence',
    'ast_evidence', 'symbol_match', 'exact_path_match',
    'graph_seed_count', 'shortest_path_available', 'community_agreement', 'authority', 'hop_budget_remaining',
    'compile_failed', 'test_failed', 'retry_count', 'historical_success',
    'vram_pressure', 'context_pressure', 'latency_pressure', 'cache_hit_ratio',
]

ACTIONS = [
    'LEXICAL_SEARCH', 'SEMANTIC_SEARCH', 'GRAPH_TRACE', 'GRAPH_EXPAND', 'FAST_RERANK',
    'DEEP_RERANK', 'INSPECT_SOURCE', 'PATCH', 'COMPILE', 'TEST', 'RECOVER', 'TERMINATE',
]
MODELS = ['NO_LLM', 'ORNITH', 'GEMMA4']
BUDGETS = ['SMALL', 'MEDIUM', 'DEEP']
