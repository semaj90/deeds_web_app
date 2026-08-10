"""EXPERIMENT-ONLY finite policy environment contract.

Do not wire PPO until RouteTrace rewards are stable and replayable. This file defines the action and
reward boundary so later RL cannot invent unbounded graph/tool actions.
"""
from dataclasses import dataclass

ACTIONS = (
    'LEXICAL_SEARCH', 'SEMANTIC_SEARCH', 'GRAPH_TRACE', 'GRAPH_EXPAND', 'FAST_RERANK',
    'DEEP_RERANK', 'INSPECT_SOURCE', 'PATCH', 'COMPILE', 'TEST', 'RECOVER', 'TERMINATE',
)

@dataclass(frozen=True)
class RewardComponents:
    compile_success: float = 0.0
    test_success: float = 0.0
    retrieval_gain: float = 0.0
    latency_penalty: float = 0.0
    token_penalty: float = 0.0
    invalid_action_penalty: float = 0.0

    @property
    def total(self) -> float:
        return (
            2.0 * self.compile_success + 4.0 * self.test_success + self.retrieval_gain
            - self.latency_penalty - self.token_penalty - 5.0 * self.invalid_action_penalty
        )
