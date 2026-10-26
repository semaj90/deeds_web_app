import math
from typing import Dict, List, Optional, Tuple
import torch
import torch.nn.functional as F
from pydantic import BaseModel, Field

# Optional GPU cuVS import with graceful PyTorch GPU/CPU fallback
try:
    import cupy as cp
    from cuvs.neighbors import ivf_flat
    CUVS_AVAILABLE = True
except ImportError:
    CUVS_AVAILABLE = False


# ============================================================================
# 1. Schema Validation (.okf AST Packet & Database Qualification Gate)
# ============================================================================
class OkfAstNodeSchema(BaseModel):
    symbol_id: str
    workspace_id: str
    source_revision: str
    start_byte: int = Field(ge=0)
    end_byte: int = Field(gt=0)
    qualification: str = Field(pattern="^(STRUCTURAL_PROVEN|HUMAN_REVIEWED|PROPOSED)$")
    fan_out_cap: int = Field(default=32, ge=1, le=200)


# ============================================================================
# 2. Spatial Indexing: L2 Norm + Hilbert Key + Hamming J-Space + NVIDIA cuVS
# ============================================================================
class SpatialCodebaseIndex:
    def __init__(self, dim: int = 4096, j_bits: int = 64, num_voronoi_cells: int = 64, device: str = "cpu"):
        self.dim = dim
        self.j_bits = j_bits
        self.num_voronoi_cells = num_voronoi_cells
        self.device = device
        # Fixed Gaussian projection matrix for Hamming J-Space
        torch.manual_seed(42)
        self.hamming_proj = torch.randn(dim, j_bits, device=device)

    def normalize_and_hash(self, embeddings: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        1. L2-normalizes embeddings onto unit hypersphere.
        2. Projects into J-bit binary Hamming space.
        3. Computes a 1D Hilbert-like spatial locality key from top principal axes.
        """
        # L2 Normalization
        x_l2 = F.normalize(embeddings.to(self.device), p=2.0, dim=-1)

        # Hamming J-Space binary signature (0/1 bits, shape: [N, j_bits])
        hamming_bits = (x_l2 @ self.hamming_proj > 0).to(torch.uint8)

        # Coarse 16-bit 2D Hilbert curve locality index from first two orthogonal projections
        coords = ((x_l2[:, :2] + 1.0) * 127.5).clamp(0, 255).to(torch.int64)
        hilbert_keys = self._xy_to_hilbert_16bit(coords[:, 0], coords[:, 1])

        return x_l2, hamming_bits, hilbert_keys

    @staticmethod
    def _xy_to_hilbert_16bit(x: torch.Tensor, y: torch.Tensor, order: int = 8) -> torch.Tensor:
        """Vectorized 2D Hilbert space-filling curve index for cache-line sorting."""
        d = torch.zeros_like(x)
        s = 1 << (order - 1)
        x_c, y_c = x.clone(), y.clone()
        while s > 0:
            rx = (x_c & s) > 0
            ry = (y_c & s) > 0
            d += s * s * ((3 * rx.long()) ^ ry.long())
            # Rotate/flip quadrant
            mask_ry0 = ~ry
            swap_mask = mask_ry0 & rx
            x_c = torch.where(swap_mask, (1 << order) - 1 - x_c, x_c)
            y_c = torch.where(swap_mask, (1 << order) - 1 - y_c, y_c)
            x_tmp = torch.where(mask_ry0, y_c, x_c)
            y_c = torch.where(mask_ry0, x_c, y_c)
            x_c = x_tmp
            s >>= 1
        return d

    def search_voronoi_cuvs(self, dataset_l2: torch.Tensor, query_l2: torch.Tensor, top_k: int = 16) -> torch.Tensor:
        """Uses NVIDIA cuVS IVF-Flat Voronoi index when available, else exact L2 GEMM."""
        if CUVS_AVAILABLE and dataset_l2.is_cuda:
            ds_cp = cp.asarray(dataset_l2.detach())
            q_cp = cp.asarray(query_l2.detach())
            params = ivf_flat.IndexParams(n_lists=min(self.num_voronoi_cells, dataset_l2.shape[0]), metric="inner_product")
            index = ivf_flat.build(params, ds_cp)
            search_params = ivf_flat.SearchParams(n_probes=8)
            _, neighbors = ivf_flat.search(search_params, index, q_cp, top_k)
            return torch.as_tensor(neighbors, device=self.device)
        # Fallback: Cosine / Inner-product Voronoi search in PyTorch
        scores = query_l2 @ dataset_l2.T
        return torch.topk(scores, k=min(top_k, dataset_l2.shape[0]), dim=-1).indices


# ============================================================================
# 3. Ewin Tang Quantum-Inspired Low-Rank Recommender (L2 Importance Sampling)
# ============================================================================
def ewin_tang_low_rank_recommend(
    affinity_matrix: torch.Tensor,
    query_vec: torch.Tensor,
    sample_size: int = 32,
    rank_k: int = 8
) -> torch.Tensor:
    """
    Samples rows of the AST affinity matrix proportionally to squared row L2-norms
    (p_i = ||A_i||_2^2 / ||A||_F^2) to compute a fast low-rank recommendation score.
    """
    row_norms_sq = torch.sum(affinity_matrix ** 2, dim=1)
    frob_norm_sq = torch.sum(row_norms_sq) + 1e-12
    row_probs = row_norms_sq / frob_norm_sq

    s = min(sample_size, affinity_matrix.shape[0])
    sampled_rows = torch.multinomial(row_probs, num_samples=s, replacement=True)

    # Rescale sampled sketch matrix S so E[S^T S] = A^T A
    scale = torch.sqrt(s * row_probs[sampled_rows]).unsqueeze(1) + 1e-12
    sketch = affinity_matrix[sampled_rows] / scale

    # Low-rank SVD on the tiny sketch
    u, sigma, vh = torch.linalg.svd(sketch, full_matrices=False)
    k = min(rank_k, vh.shape[0])
    v_k = vh[:k, :]  # Top-k right singular vectors [k, D]

    # Project query and items into rank-k subspace
    proj_query = v_k @ query_vec.unsqueeze(-1)            # [k, 1]
    proj_items = affinity_matrix @ v_k.T                  # [N, k]
    return (proj_items @ proj_query).squeeze(-1)          # [N] recommendation scores


# ============================================================================
# 4. Naive Bayes + Logistic Regression -> HMM / FSM Chain Rule Router
# ============================================================================
class HmmFsmRouter:
    """
    Combines Naive Bayes log-odds + Logistic Regression emission calibration
    with an FSM-constrained HMM Viterbi decoder.
    """
    STATES = ["PARSE_AST", "RESOLVE_SYMBOL", "CHECK_DB_SCHEMA", "FANOUT_PAGERANK", "MCTS_SIMULATE"]

    def __init__(self):
        # Deterministic FSM adjacency mask (1 = legal transition, 0 = forbidden by schema)
        self.fsm_mask = torch.tensor([
            # PARSE  RESOLVE  DB_CHK  PAGERANK  MCTS
            [0.10,   0.85,    0.05,   0.00,     0.00], # From PARSE_AST
            [0.00,   0.20,    0.80,   0.00,     0.00], # From RESOLVE_SYMBOL
            [0.00,   0.00,    0.10,   0.90,     0.00], # From CHECK_DB_SCHEMA
            [0.00,   0.00,    0.00,   0.20,     0.80], # From FANOUT_PAGERANK
            [0.00,   0.00,    0.00,   0.10,     0.90], # From MCTS_SIMULATE
        ], dtype=torch.float32)

    def viterbi_decode(self, nb_log_priors: torch.Tensor, lr_weights: torch.Tensor) -> List[str]:
        """
        nb_log_priors: [T, num_states] Naive Bayes log-likelihoods per step
        lr_weights:    [T, num_states] Logistic Regression linear logits
        """
        # Fuse Naive Bayes + Logistic Regression into calibrated log-emissions
        emissions = F.log_softmax(lr_weights + nb_log_priors, dim=-1)
        log_trans = torch.log(self.fsm_mask + 1e-12)

        T, S = emissions.shape
        dp = torch.full((T, S), -1e9)
        backptr = torch.zeros((T, S), dtype=torch.long)
        dp[0] = emissions[0]

        for t in range(1, T):
            scores = dp[t - 1].unsqueeze(1) + log_trans  # [S_prev, S_curr]
            best_prev_scores, best_prev_idx = torch.max(scores, dim=0)
            dp[t] = best_prev_scores + emissions[t]
            backptr[t] = best_prev_idx

        # Backtrack optimal state sequence
        path = [int(torch.argmax(dp[-1]).item())]
        for t in range(T - 1, 0, -1):
            path.append(int(backptr[t, path[-1]].item()))
        path.reverse()
        return [self.STATES[idx] for idx in path]


# ============================================================================
# 5. Custom Fan-Out PageRank + AlphaGo MCTS (PUCT) Rollout Engine
# ============================================================================
def custom_fanout_pagerank(
    adj_weights: torch.Tensor,        # [N, N] edge weights (qualified edges only)
    personalization: torch.Tensor,    # [N] query + Ewin Tang seed vector
    alpha: float = 0.85,
    max_fanout: int = 32,
    fanout_penalty: float = 0.5,
    iters: int = 20
) -> torch.Tensor:
    """
    Computes Personalized PageRank with a hub fan-out penalty so noisy
    utility files with high out-degree do not dominate retrieval.
    """
    N = adj_weights.shape[0]
    out_degree = (adj_weights > 0).sum(dim=1).float()
    excess_fanout = torch.clamp(out_degree - max_fanout, min=0.0)
    row_denom = adj_weights.sum(dim=1) + fanout_penalty * excess_fanout + 1e-12

    # Column-stochastic damped transition matrix
    trans = (adj_weights / row_denom.unsqueeze(1)).T  # [N, N]

    p = F.softmax(personalization, dim=0)
    r = p.clone()
    for _ in range(iters):
        r = (1.0 - alpha) * p + alpha * (trans @ r)
    return r / (r.sum() + 1e-12)


class AlphaGoCodeMCTSNode:
    def __init__(self, state_id: int, prior: float):
        self.state_id = state_id
        self.prior = prior
        self.visit_count = 0
        self.value_sum = 0.0
        self.children: Dict[int, "AlphaGoCodeMCTSNode"] = {}

    @property
    def q_value(self) -> float:
        return self.value_sum / self.visit_count if self.visit_count > 0 else 0.0


def run_alphago_mcts_code_search(
    root_state: int,
    adj_matrix: torch.Tensor,
    pagerank_priors: torch.Tensor,
    num_simulations: int = 64,
    c_puct: float = 1.414
) -> List[Tuple[int, int, float]]:
    """
    Runs AlphaGo-style MCTS over the qualified AST graph using Custom Fan-Out
    PageRank + Ewin Tang scores as the PUCT prior policy P(s, a).
    """
    root = AlphaGoCodeMCTSNode(root_state, prior=1.0)

    for _ in range(num_simulations):
        node = root
        search_path = [node]

        # 1. Selection via PUCT
        while node.children:
            total_sqrt = math.sqrt(sum(c.visit_count for c in node.children.values()) + 1)
            best_score = -1e9
            best_child = None
            for child in node.children.values():
                u_score = c_puct * child.prior * (total_sqrt / (1 + child.visit_count))
                puct = child.q_value + u_score
                if puct > best_score:
                    best_score = puct
                    best_child = child
            node = best_child
            search_path.append(node)

        # 2. Expansion using qualified AST edges
        neighbors = torch.nonzero(adj_matrix[node.state_id] > 0, as_tuple=False).squeeze(-1)
        if neighbors.numel() > 0:
            priors = pagerank_priors[neighbors]
            priors = priors / (priors.sum() + 1e-12)
            for idx, nbr in enumerate(neighbors.tolist()):
                node.children[nbr] = AlphaGoCodeMCTSNode(nbr, prior=float(priors[idx]))

        # 3. Value Evaluation (PageRank + Cosine coherence reward)
        leaf_value = float(pagerank_priors[node.state_id].item())

        # 4. Backpropagation
        for visited in search_path:
            visited.visit_count += 1
            visited.value_sum += leaf_value

    # Return ranked children: [(node_id, visits, q_value), ...]
    ranked = [
        (cid, child.visit_count, round(child.q_value, 4))
        for cid, child in root.children.items()
    ]
    return sorted(ranked, key=lambda item: item[1], reverse=True)
