"""
HMM Legal Topic Model
Hidden Markov Model for legal document structure discovery
Identifies transitions: Facts → Reasoning → Holding
"""

import numpy as np
from typing import List, Tuple, Dict
from dataclasses import dataclass
import json


@dataclass
class HMMState:
    """HMM state representation"""
    name: str
    emission_probs: Dict[str, float]  # word -> probability
    transition_probs: Dict[str, float]  # next_state -> probability


class LegalHMM:
    """Hidden Markov Model for legal document structure"""

    # Legal document states
    STATES = ['PARTIES', 'JURISDICTION', 'FACTS', 'LEGAL_AUTHORITY', 'CLAIMS', 'PRAYER', 'HOLDING']

    # Transition matrix (legal document flow)
    TRANSITIONS = {
        'PARTIES': {'JURISDICTION': 0.9, 'FACTS': 0.1},
        'JURISDICTION': {'FACTS': 0.8, 'LEGAL_AUTHORITY': 0.2},
        'FACTS': {'LEGAL_AUTHORITY': 0.7, 'CLAIMS': 0.3},
        'LEGAL_AUTHORITY': {'CLAIMS': 0.8, 'FACTS': 0.2},
        'CLAIMS': {'PRAYER': 0.6, 'HOLDING': 0.4},
        'PRAYER': {'HOLDING': 0.9, 'PARTIES': 0.1},
        'HOLDING': {'PARTIES': 0.1, 'HOLDING': 0.9},
    }

    # Emission probabilities (keywords per state)
    EMISSIONS = {
        'PARTIES': {
            'plaintiff': 0.15, 'defendant': 0.15, 'appellant': 0.1,
            'respondent': 0.1, 'petitioner': 0.1, 'v.': 0.2,
            'versus': 0.15, 'party': 0.05,
        },
        'JURISDICTION': {
            'jurisdiction': 0.2, 'venue': 0.15, 'court': 0.15,
            'district': 0.1, 'federal': 0.1, 'state': 0.1,
            'competent': 0.05, 'proper': 0.05,
        },
        'FACTS': {
            'occurred': 0.1, 'happened': 0.1, 'alleged': 0.15,
            'facts': 0.1, 'incident': 0.1, 'event': 0.1,
            'date': 0.1, 'time': 0.05, 'place': 0.05,
        },
        'LEGAL_AUTHORITY': {
            'statute': 0.15, 'regulation': 0.15, 'constitution': 0.1,
            'law': 0.15, 'code': 0.1, 'section': 0.1,
            'u.s.c.': 0.1, 'precedent': 0.05,
        },
        'CLAIMS': {
            'claim': 0.2, 'cause': 0.15, 'action': 0.15,
            'violation': 0.15, 'breach': 0.1, 'negligence': 0.1,
            'damages': 0.05,
        },
        'PRAYER': {
            'prayer': 0.2, 'relief': 0.2, 'damages': 0.15,
            'injunction': 0.15, 'declaratory': 0.1, 'request': 0.05,
        },
        'HOLDING': {
            'held': 0.2, 'holding': 0.2, 'ruled': 0.15,
            'affirmed': 0.1, 'reversed': 0.1, 'remanded': 0.1,
            'therefore': 0.05,
        },
    }

    def __init__(self):
        self.states = self.STATES
        self.transitions = self.TRANSITIONS
        self.emissions = self.EMISSIONS

    def tokenize_and_normalize(self, text: str) -> List[str]:
        """Tokenize and normalize text"""
        import re
        # Simple tokenization
        tokens = re.findall(r'\b\w+\b', text.lower())
        return tokens

    def get_emission_prob(self, state: str, word: str) -> float:
        """Get emission probability for word in state"""
        if state not in self.emissions:
            return 0.01
        return self.emissions[state].get(word, 0.01)

    def get_transition_prob(self, from_state: str, to_state: str) -> float:
        """Get transition probability"""
        if from_state not in self.transitions:
            return 1.0 / len(self.states)
        return self.transitions[from_state].get(to_state, 0.01)

    def viterbi(self, observations: List[str]) -> Tuple[List[str], float]:
        """Viterbi algorithm for most likely state sequence"""
        n_obs = len(observations)
        n_states = len(self.states)

        # Initialize
        viterbi_matrix = np.zeros((n_states, n_obs))
        path_matrix = np.zeros((n_states, n_obs), dtype=int)

        # First observation
        for i, state in enumerate(self.states):
            emission_prob = self.get_emission_prob(state, observations[0])
            viterbi_matrix[i, 0] = np.log(emission_prob + 1e-10)

        # Forward pass
        for t in range(1, n_obs):
            for j, to_state in enumerate(self.states):
                emission_prob = self.get_emission_prob(to_state, observations[t])

                # Find best previous state
                best_prob = -np.inf
                best_state = 0

                for i, from_state in enumerate(self.states):
                    trans_prob = self.get_transition_prob(from_state, to_state)
                    prob = viterbi_matrix[i, t - 1] + np.log(trans_prob + 1e-10)

                    if prob > best_prob:
                        best_prob = prob
                        best_state = i

                viterbi_matrix[j, t] = best_prob + np.log(emission_prob + 1e-10)
                path_matrix[j, t] = best_state

        # Backtrack
        path = []
        state = np.argmax(viterbi_matrix[:, -1])
        path.append(state)

        for t in range(n_obs - 1, 0, -1):
            state = path_matrix[state, t]
            path.append(state)

        path.reverse()
        state_sequence = [self.states[s] for s in path]
        probability = np.exp(np.max(viterbi_matrix[:, -1]))

        return state_sequence, probability

    def segment_document(self, text: str, chunk_size: int = 100) -> List[Dict]:
        """Segment document into labeled chunks"""
        tokens = self.tokenize_and_normalize(text)
        segments = []

        for i in range(0, len(tokens), chunk_size):
            chunk_tokens = tokens[i : i + chunk_size]
            state_sequence, prob = self.viterbi(chunk_tokens)

            # Get most common state
            from collections import Counter
            most_common_state = Counter(state_sequence).most_common(1)[0][0]

            segments.append({
                'start': i,
                'end': min(i + chunk_size, len(tokens)),
                'state': most_common_state,
                'probability': float(prob),
                'tokens': chunk_tokens,
            })

        return segments

    def predict_states(self, chunks: List[str]) -> List[Dict]:
        """Predict states for multiple chunks"""
        results = []

        for i, chunk in enumerate(chunks):
            tokens = self.tokenize_and_normalize(chunk)
            state_sequence, prob = self.viterbi(tokens)

            # Get state distribution
            from collections import Counter
            state_dist = Counter(state_sequence)
            total = sum(state_dist.values())
            state_probs = {state: count / total for state, count in state_dist.items()}

            results.append({
                'chunk_index': i,
                'primary_state': max(state_probs, key=state_probs.get),
                'state_probabilities': state_probs,
                'confidence': float(prob),
            })

        return results


# FastAPI service
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

app = FastAPI(title="HMM Legal Topic Model")
hmm = LegalHMM()


class SegmentRequest(BaseModel):
    text: str
    chunk_size: int = 100


class PredictRequest(BaseModel):
    chunks: List[str]


@app.post("/segment")
async def segment(request: SegmentRequest):
    """Segment document into legal topics"""
    try:
        segments = hmm.segment_document(request.text, request.chunk_size)
        return {"segments": segments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict")
async def predict(request: PredictRequest):
    """Predict legal topics for chunks"""
    try:
        predictions = hmm.predict_states(request.chunks)
        return {"predictions": predictions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check"""
    return {"status": "healthy", "model": "HMM Legal Topic Model"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
