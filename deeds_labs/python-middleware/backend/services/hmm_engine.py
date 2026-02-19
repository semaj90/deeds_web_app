"""
HMM Missing-Link Inference Engine

Implements Hidden Markov Model for sequential pattern recognition.
Identifies missing steps in reasoning chains and scores them by probability.

Usage:
    hmm = HMMEngine()
    missing_links = hmm.infer_missing_links(sequence)
    scored_links = hmm.score_missing_links(missing_links)
"""

import logging
import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import json

logger = logging.getLogger(__name__)


@dataclass
class MissingLink:
    """Missing link in reasoning chain"""

    from_node: str
    to_node: str
    probability: float
    reasoning_type: str
    confidence: float


class HMMEngine:
    """Hidden Markov Model for missing-link inference"""

    def __init__(self, num_states: int = 26, num_observations: int = 26):
        """
        Initialize HMM engine.

        Args:
            num_states: Number of hidden states (runes)
            num_observations: Number of possible observations
        """
        self.num_states = num_states
        self.num_observations = num_observations

        # Initialize transition matrix (state to state)
        self.transition_matrix = np.ones((num_states, num_states)) / num_states

        # Initialize emission matrix (state to observation)
        self.emission_matrix = np.ones((num_states, num_observations)) / num_observations

        # Initialize state prior
        self.state_prior = np.ones(num_states) / num_states

        # Reasoning type patterns
        self.reasoning_patterns = {
            "causal": {"weight": 0.8, "description": "Causal relationship"},
            "temporal": {"weight": 0.7, "description": "Temporal sequence"},
            "logical": {"weight": 0.9, "description": "Logical implication"},
            "analogical": {"weight": 0.6, "description": "Analogical reasoning"},
            "evidential": {"weight": 0.85, "description": "Evidence chain"},
        }

        logger.info(f"HMMEngine initialized (states={num_states}, observations={num_observations})")

    def train(self, sequences: List[List[int]], iterations: int = 10) -> None:
        """
        Train HMM on sequences using Baum-Welch algorithm.

        Args:
            sequences: List of observation sequences
            iterations: Number of training iterations
        """
        try:
            for iteration in range(iterations):
                # Simplified Baum-Welch: update based on observed sequences
                for sequence in sequences:
                    # Forward pass
                    forward_probs = self._forward_pass(sequence)

                    # Backward pass
                    backward_probs = self._backward_pass(sequence)

                    # Update matrices
                    self._update_matrices(sequence, forward_probs, backward_probs)

            logger.info(f"HMM training completed ({iterations} iterations)")

        except Exception as e:
            logger.error(f"HMM training failed: {e}")

    def _forward_pass(self, sequence: List[int]) -> np.ndarray:
        """Forward pass for HMM"""
        T = len(sequence)
        forward = np.zeros((T, self.num_states))

        # Initialize
        forward[0] = self.state_prior * self.emission_matrix[:, sequence[0]]

        # Recursion
        for t in range(1, T):
            for j in range(self.num_states):
                forward[t, j] = (
                    np.sum(forward[t - 1] * self.transition_matrix[:, j])
                    * self.emission_matrix[j, sequence[t]]
                )

        return forward

    def _backward_pass(self, sequence: List[int]) -> np.ndarray:
        """Backward pass for HMM"""
        T = len(sequence)
        backward = np.zeros((T, self.num_states))

        # Initialize
        backward[T - 1] = 1.0

        # Recursion
        for t in range(T - 2, -1, -1):
            for i in range(self.num_states):
                backward[t, i] = np.sum(
                    self.transition_matrix[i, :]
                    * self.emission_matrix[:, sequence[t + 1]]
                    * backward[t + 1]
                )

        return backward

    def _update_matrices(
        self, sequence: List[int], forward: np.ndarray, backward: np.ndarray
    ) -> None:
        """Update HMM matrices based on forward/backward probabilities"""
        T = len(sequence)

        # Compute posteriors
        posteriors = (forward * backward) / (np.sum(forward[-1]) + 1e-10)

        # Update state prior
        self.state_prior = posteriors[0]

        # Update transition matrix
        for i in range(self.num_states):
            for j in range(self.num_states):
                numerator = 0.0
                denominator = 0.0

                for t in range(T - 1):
                    numerator += (
                        forward[t, i]
                        * self.transition_matrix[i, j]
                        * self.emission_matrix[j, sequence[t + 1]]
                        * backward[t + 1, j]
                    )
                    denominator += forward[t, i] * backward[t, i]

                if denominator > 0:
                    self.transition_matrix[i, j] = numerator / denominator

    def infer_missing_links(self, sequence: List[str]) -> List[MissingLink]:
        """
        Infer missing links in a reasoning sequence.

        Args:
            sequence: List of node IDs in sequence

        Returns:
            List of missing links with probabilities
        """
        try:
            missing_links = []

            # Check for gaps in sequence
            for i in range(len(sequence) - 1):
                from_node = sequence[i]
                to_node = sequence[i + 1]

                # Check if direct connection is likely
                transition_prob = self._get_transition_probability(from_node, to_node)

                # If probability is low, infer missing links
                if transition_prob < 0.5:
                    # Find intermediate nodes
                    intermediates = self._find_intermediates(from_node, to_node)

                    for intermediate in intermediates:
                        link = MissingLink(
                            from_node=from_node,
                            to_node=intermediate,
                            probability=self._get_transition_probability(from_node, intermediate),
                            reasoning_type=self._infer_reasoning_type(from_node, intermediate),
                            confidence=0.7,
                        )
                        missing_links.append(link)

            logger.debug(f"Inferred {len(missing_links)} missing links")
            return missing_links

        except Exception as e:
            logger.error(f"Missing link inference failed: {e}")
            return []

    def _get_transition_probability(self, from_node: str, to_node: str) -> float:
        """Get transition probability between nodes"""
        try:
            # Convert node IDs to indices
            from_idx = int(from_node) % self.num_states
            to_idx = int(to_node) % self.num_states

            return float(self.transition_matrix[from_idx, to_idx])

        except Exception:
            return 0.5  # Default probability

    def _find_intermediates(self, from_node: str, to_node: str, depth: int = 2) -> List[str]:
        """Find intermediate nodes between two nodes"""
        intermediates = []

        try:
            from_idx = int(from_node) % self.num_states
            to_idx = int(to_node) % self.num_states

            # Find high-probability intermediate states
            for intermediate_idx in range(self.num_states):
                # Check if path through intermediate is high probability
                prob_from_to_intermediate = self.transition_matrix[from_idx, intermediate_idx]
                prob_intermediate_to_to = self.transition_matrix[intermediate_idx, to_idx]

                combined_prob = prob_from_to_intermediate * prob_intermediate_to_to

                if combined_prob > 0.3:  # Threshold
                    intermediates.append(str(intermediate_idx))

            # Sort by probability
            intermediates.sort(
                key=lambda x: self._get_transition_probability(from_node, x), reverse=True
            )

            return intermediates[:3]  # Return top 3

        except Exception as e:
            logger.error(f"Finding intermediates failed: {e}")
            return []

    def _infer_reasoning_type(self, from_node: str, to_node: str) -> str:
        """Infer the type of reasoning between nodes"""
        try:
            from_idx = int(from_node) % self.num_states
            to_idx = int(to_node) % self.num_states

            # Use transition probability to infer reasoning type
            prob = self.transition_matrix[from_idx, to_idx]

            if prob > 0.8:
                return "causal"
            elif prob > 0.7:
                return "evidential"
            elif prob > 0.6:
                return "logical"
            elif prob > 0.5:
                return "temporal"
            else:
                return "analogical"

        except Exception:
            return "logical"

    def score_missing_links(self, missing_links: List[MissingLink]) -> List[MissingLink]:
        """
        Score missing links by probability and reasoning type.

        Args:
            missing_links: List of missing links

        Returns:
            Scored missing links
        """
        try:
            for link in missing_links:
                # Base score from probability
                base_score = link.probability

                # Adjust by reasoning type weight
                reasoning_weight = self.reasoning_patterns.get(link.reasoning_type, {}).get(
                    "weight", 0.5
                )

                # Final score
                link.confidence = base_score * reasoning_weight

            # Sort by confidence
            missing_links.sort(key=lambda x: x.confidence, reverse=True)

            logger.debug(f"Scored {len(missing_links)} missing links")
            return missing_links

        except Exception as e:
            logger.error(f"Scoring missing links failed: {e}")
            return missing_links

    def get_viterbi_path(self, observations: List[int]) -> List[int]:
        """
        Find most likely state sequence using Viterbi algorithm.

        Args:
            observations: List of observations

        Returns:
            Most likely state sequence
        """
        try:
            T = len(observations)
            viterbi = np.zeros((T, self.num_states))
            backpointer = np.zeros((T, self.num_states), dtype=int)

            # Initialize
            viterbi[0] = np.log(self.state_prior + 1e-10) + np.log(
                self.emission_matrix[:, observations[0]] + 1e-10
            )

            # Recursion
            for t in range(1, T):
                for j in range(self.num_states):
                    temp = (
                        viterbi[t - 1]
                        + np.log(self.transition_matrix[:, j] + 1e-10)
                        + np.log(self.emission_matrix[j, observations[t]] + 1e-10)
                    )

                    backpointer[t, j] = np.argmax(temp)
                    viterbi[t, j] = np.max(temp)

            # Backtrack
            path = [np.argmax(viterbi[T - 1])]
            for t in range(T - 1, 0, -1):
                path.append(backpointer[t, path[-1]])

            path.reverse()
            return path

        except Exception as e:
            logger.error(f"Viterbi path computation failed: {e}")
            return []


# Singleton instance
_hmm_engine = None


def get_hmm_engine() -> HMMEngine:
    """Get or create singleton HMM engine"""
    global _hmm_engine
    if _hmm_engine is None:
        _hmm_engine = HMMEngine()
    return _hmm_engine
