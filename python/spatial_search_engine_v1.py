import math
import hashlib
import json
import os
import struct
import sys
import tempfile
from pathlib import Path
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


# J-Space projections are immutable, revisioned artifacts. The file format is
# a small JSON manifest followed by little-endian float32 matrix bytes; it
# deliberately avoids pickle/torch.load for untrusted artifact inputs.
_JSPACE_MAGIC_V1 = b"PAJSP1\x00"
_JSPACE_MAX_MANIFEST_BYTES = 4096
_JSPACE_MAX_MATRIX_BYTES = 64 * 1024 * 1024


def _jspace_sha256(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def build_hamming_projection_artifact_v1(
    dim: int = 4096,
    j_bits: int = 64,
    seed: int = 42,
) -> tuple[bytes, dict[str, object]]:
    """Build a portable CPU-generated projection artifact deterministically."""
    if not isinstance(dim, int) or isinstance(dim, bool) or dim < 1:
        raise ValueError("JSPACE_DIM_INVALID")
    if not isinstance(j_bits, int) or isinstance(j_bits, bool) or j_bits < 1:
        raise ValueError("JSPACE_BITS_INVALID")
    if not isinstance(seed, int) or isinstance(seed, bool) or seed < 0 or seed > 0x7FFF_FFFF_FFFF_FFFF:
        raise ValueError("JSPACE_SEED_INVALID")
    byte_length = dim * j_bits * 4
    if byte_length > _JSPACE_MAX_MATRIX_BYTES:
        raise ValueError("JSPACE_MATRIX_BYTE_LIMIT_EXCEEDED")
    if sys.byteorder != "little":
        raise ValueError("JSPACE_LITTLE_ENDIAN_HOST_REQUIRED")

    generator = torch.Generator(device="cpu")
    generator.manual_seed(seed)
    matrix = torch.randn((dim, j_bits), generator=generator, dtype=torch.float32, device="cpu")
    matrix_bytes = matrix.contiguous().numpy().tobytes(order="C")
    manifest: dict[str, object] = {
        "schema": "parent-atlas.jspace-projection.v1",
        "seed": seed,
        "rows": dim,
        "columns": j_bits,
        "dtype": "float32-le",
        "bitOrder": "least-significant-bit-first",
        "generationDevice": "cpu",
        "generator": "torch.Generator(cpu)+torch.randn(float32)",
        "torchVersion": str(torch.__version__),
        "matrixByteLength": len(matrix_bytes),
        "matrixSha256": _jspace_sha256(matrix_bytes),
    }
    manifest_bytes = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(manifest_bytes) > _JSPACE_MAX_MANIFEST_BYTES:
        raise ValueError("JSPACE_MANIFEST_BYTE_LIMIT_EXCEEDED")
    artifact = _JSPACE_MAGIC_V1 + struct.pack(">I", len(manifest_bytes)) + manifest_bytes + matrix_bytes
    return artifact, {**manifest, "artifactSha256": _jspace_sha256(artifact)}


def decode_hamming_projection_artifact_v1(
    artifact: bytes | bytearray | memoryview,
    *,
    expected_artifact_sha256: Optional[str] = None,
) -> tuple[torch.Tensor, dict[str, object]]:
    """Decode and verify a J-Space projection artifact before tensor creation."""
    raw = bytes(artifact)
    artifact_sha = _jspace_sha256(raw)
    if expected_artifact_sha256 is not None:
        expected = str(expected_artifact_sha256).strip().lower()
        if not expected.startswith("sha256:"):
            expected = f"sha256:{expected}"
        if expected != artifact_sha:
            raise ValueError("JSPACE_ARTIFACT_SHA256_MISMATCH")
    header_size = len(_JSPACE_MAGIC_V1) + 4
    if len(raw) < header_size or not raw.startswith(_JSPACE_MAGIC_V1):
        raise ValueError("JSPACE_ARTIFACT_MAGIC_INVALID")
    manifest_length = struct.unpack(">I", raw[len(_JSPACE_MAGIC_V1):header_size])[0]
    if manifest_length < 2 or manifest_length > _JSPACE_MAX_MANIFEST_BYTES:
        raise ValueError("JSPACE_MANIFEST_LENGTH_INVALID")
    manifest_end = header_size + manifest_length
    if manifest_end > len(raw):
        raise ValueError("JSPACE_MANIFEST_TRUNCATED")
    try:
        manifest = json.loads(raw[header_size:manifest_end].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("JSPACE_MANIFEST_INVALID") from exc
    if not isinstance(manifest, dict) or manifest.get("schema") != "parent-atlas.jspace-projection.v1":
        raise ValueError("JSPACE_SCHEMA_UNSUPPORTED")
    rows, columns = manifest.get("rows"), manifest.get("columns")
    if any(not isinstance(v, int) or isinstance(v, bool) or v < 1 for v in (rows, columns)):
        raise ValueError("JSPACE_SHAPE_INVALID")
    seed = manifest.get("seed")
    if not isinstance(seed, int) or isinstance(seed, bool) or seed < 0 or seed > 0x7FFF_FFFF_FFFF_FFFF:
        raise ValueError("JSPACE_SEED_INVALID")
    matrix_length = rows * columns * 4
    matrix_bytes = raw[manifest_end:]
    if matrix_length > _JSPACE_MAX_MATRIX_BYTES or len(matrix_bytes) != matrix_length:
        raise ValueError("JSPACE_MATRIX_LENGTH_INVALID")
    if manifest.get("dtype") != "float32-le" or manifest.get("bitOrder") != "least-significant-bit-first":
        raise ValueError("JSPACE_ENCODING_UNSUPPORTED")
    if manifest.get("generationDevice") != "cpu" or sys.byteorder != "little":
        raise ValueError("JSPACE_GENERATION_DEVICE_UNSUPPORTED")
    if manifest.get("matrixByteLength") != matrix_length or manifest.get("matrixSha256") != _jspace_sha256(matrix_bytes):
        raise ValueError("JSPACE_MATRIX_CHECKSUM_MISMATCH")
    matrix = torch.frombuffer(bytearray(matrix_bytes), dtype=torch.float32).clone().reshape(rows, columns)
    if not bool(torch.isfinite(matrix).all().item()):
        raise ValueError("JSPACE_MATRIX_NONFINITE")
    return matrix, {**manifest, "artifactSha256": artifact_sha}


def write_hamming_projection_artifact_v1(
    path: str | os.PathLike[str],
    *,
    dim: int = 4096,
    j_bits: int = 64,
    seed: int = 42,
) -> dict[str, object]:
    """Explicitly write one immutable projection artifact without overwriting it."""
    artifact, manifest = build_hamming_projection_artifact_v1(dim, j_bits, seed)
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        existing = target.read_bytes()
        if existing != artifact:
            raise ValueError("JSPACE_ARTIFACT_PATH_IMMUTABLE")
        decode_hamming_projection_artifact_v1(existing, expected_artifact_sha256=manifest["artifactSha256"])
        return {**manifest, "path": str(target)}
    fd, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(artifact)
            stream.flush()
            os.fsync(stream.fileno())
        # Hard-link creation is atomic and fails if another writer already
        # published this content-addressed path; it cannot replace a winner.
        os.link(temporary_name, target)
        os.unlink(temporary_name)
    except FileExistsError:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        existing = target.read_bytes()
        if existing != artifact:
            raise ValueError("JSPACE_ARTIFACT_PATH_IMMUTABLE")
        decode_hamming_projection_artifact_v1(existing, expected_artifact_sha256=manifest["artifactSha256"])
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise
    return {**manifest, "path": str(target)}


def tie_aware_recall_at_k_v1(
    exact_scores: torch.Tensor,
    approximate_order: torch.Tensor,
    k: int,
    *,
    tie_atol: float = 1e-7,
) -> float:
    """Compute recall@k while crediting any exact-score tie at the kth boundary."""
    if exact_scores.ndim != 1 or approximate_order.ndim != 1 or exact_scores.numel() != approximate_order.numel():
        raise ValueError("JSPACE_RECALL_VECTOR_SHAPE_INVALID")
    count = exact_scores.numel()
    if not isinstance(k, int) or isinstance(k, bool) or k < 1 or k > count:
        raise ValueError("JSPACE_RECALL_K_INVALID")
    if not math.isfinite(tie_atol) or tie_atol < 0.0:
        raise ValueError("JSPACE_RECALL_TOLERANCE_INVALID")
    scores = exact_scores.detach().to(device="cpu", dtype=torch.float64)
    order = approximate_order.detach().to(device="cpu", dtype=torch.int64)
    if not bool(torch.isfinite(scores).all().item()):
        raise ValueError("JSPACE_RECALL_EXACT_SCORE_NONFINITE")
    if bool(((order < 0) | (order >= count)).any().item()) or torch.unique(order).numel() != count:
        raise ValueError("JSPACE_RECALL_APPROXIMATE_ORDER_INVALID")
    threshold = torch.sort(scores, descending=True, stable=True).values[k - 1]
    tied_exact_topk = scores >= threshold - tie_atol
    selected = order[:k]
    return float(tied_exact_topk[selected].to(torch.float64).sum().item() / k)


def evaluate_hamming_topk_recall_v1(
    index: "SpatialCodebaseIndex",
    corpus_embeddings: torch.Tensor,
    query_embeddings: torch.Tensor,
    *,
    k_values: Tuple[int, ...] = (1, 5, 10),
    tie_atol: float = 1e-7,
    max_pairwise_comparisons: int = 2_000_000,
) -> dict[str, object]:
    """Compare Hamming shortlist order to exact cosine on a bounded frozen cohort."""
    if corpus_embeddings.ndim != 2 or query_embeddings.ndim != 2:
        raise ValueError("JSPACE_RECALL_INPUT_RANK_INVALID")
    if corpus_embeddings.shape[0] < 1 or query_embeddings.shape[0] < 1:
        raise ValueError("JSPACE_RECALL_INPUT_EMPTY")
    if corpus_embeddings.shape[1] != index.dim or query_embeddings.shape[1] != index.dim:
        raise ValueError("JSPACE_RECALL_DIMENSION_MISMATCH")
    pair_count = int(corpus_embeddings.shape[0]) * int(query_embeddings.shape[0])
    if not isinstance(max_pairwise_comparisons, int) or max_pairwise_comparisons < 1 or pair_count > max_pairwise_comparisons:
        raise ValueError("JSPACE_RECALL_PAIR_BUDGET_EXCEEDED")
    if not k_values or len(set(k_values)) != len(k_values) or any(
        not isinstance(k, int) or isinstance(k, bool) or k < 1 or k > corpus_embeddings.shape[0]
        for k in k_values
    ):
        raise ValueError("JSPACE_RECALL_K_VALUES_INVALID")
    corpus = corpus_embeddings.detach().to(device="cpu", dtype=torch.float32).contiguous()
    queries = query_embeddings.detach().to(device="cpu", dtype=torch.float32).contiguous()
    if not bool(torch.isfinite(corpus).all().item()) or not bool(torch.isfinite(queries).all().item()):
        raise ValueError("JSPACE_RECALL_INPUT_NONFINITE")
    corpus_bytes = corpus.numpy().tobytes(order="C")
    query_bytes = queries.numpy().tobytes(order="C")
    corpus_l2 = F.normalize(corpus, p=2.0, dim=-1)
    query_l2 = F.normalize(queries, p=2.0, dim=-1)
    corpus_bits = (corpus_l2 @ index.hamming_proj.detach().to(device="cpu", dtype=torch.float32) > 0).to(torch.uint8)
    query_bits = (query_l2 @ index.hamming_proj.detach().to(device="cpu", dtype=torch.float32) > 0).to(torch.uint8)
    exact_scores = query_l2 @ corpus_l2.T
    hamming_distances = (query_bits[:, None, :] != corpus_bits[None, :, :]).sum(dim=-1)
    approximate_orders = torch.argsort(hamming_distances, dim=1, stable=True)
    metrics: dict[str, dict[str, float]] = {}
    per_query: list[dict[str, object]] = []
    for k in k_values:
        recalls = [
            tie_aware_recall_at_k_v1(exact_scores[row], approximate_orders[row], k, tie_atol=tie_atol)
            for row in range(query_l2.shape[0])
        ]
        metrics[str(k)] = {"meanRecall": sum(recalls) / len(recalls), "minRecall": min(recalls)}
    for row in range(query_l2.shape[0]):
        per_query.append({
            "queryOrdinal": row,
            "hammingOrderPrefix": approximate_orders[row, : min(max(k_values), corpus.shape[0])].tolist(),
            "recallAtK": {
                str(k): tie_aware_recall_at_k_v1(exact_scores[row], approximate_orders[row], k, tie_atol=tie_atol)
                for k in k_values
            },
        })
    return {
        "schema": "parent-atlas.jspace-recall-evaluation.v1",
        "status": "FIXTURE_OR_CALLER_SUPPLIED_COHORT_ONLY",
        "cohort": {
            "corpusCount": int(corpus.shape[0]),
            "queryCount": int(queries.shape[0]),
            "embeddingDimension": int(corpus.shape[1]),
            "corpusSha256": _jspace_sha256(corpus_bytes),
            "queriesSha256": _jspace_sha256(query_bytes),
            "pairwiseComparisonCount": pair_count,
        },
        "projectionSha256": index.projection_manifest.get("artifactSha256"),
        "projectionArtifactBacked": index.projection_artifact_backed,
        "exactMetric": "cosine_similarity",
        "approximateMetric": "hamming_distance",
        "tieRule": f"exact scores within {tie_atol} of kth score are eligible hits; denominator remains k",
        "recallAtK": metrics,
        "perQuery": per_query,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


# ============================================================================
# 2. Spatial Indexing: L2 Norm + Hilbert Key + Hamming J-Space + NVIDIA cuVS
# ============================================================================
class SpatialCodebaseIndex:
    def __init__(
        self,
        dim: int = 4096,
        j_bits: int = 64,
        num_voronoi_cells: int = 64,
        device: str = "cpu",
        *,
        seed: int = 42,
        projection_path: Optional[str] = None,
        projection_sha256: Optional[str] = None,
        allow_ephemeral_projection: bool = False,
    ):
        self.dim = dim
        self.j_bits = j_bits
        self.num_voronoi_cells = num_voronoi_cells
        self.device = device
        if projection_path is not None:
            if allow_ephemeral_projection:
                raise ValueError("JSPACE_ARTIFACT_AND_EPHEMERAL_MODES_CONFLICT")
            if projection_sha256 is None:
                raise ValueError("JSPACE_ARTIFACT_HASH_REQUIRED")
            raw_artifact = Path(projection_path).read_bytes()
            matrix, manifest = decode_hamming_projection_artifact_v1(
                raw_artifact,
                expected_artifact_sha256=projection_sha256,
            )
            if tuple(matrix.shape) != (dim, j_bits):
                raise ValueError("JSPACE_ARTIFACT_SHAPE_MISMATCH")
            self.projection_manifest = manifest
            self.projection_artifact_backed = True
        else:
            if not allow_ephemeral_projection:
                raise ValueError("JSPACE_ARTIFACT_PATH_REQUIRED")
            if projection_sha256 is not None:
                raise ValueError("JSPACE_EXPECTED_HASH_REQUIRES_ARTIFACT_PATH")
            raw_artifact, _ = build_hamming_projection_artifact_v1(dim, j_bits, seed)
            matrix, self.projection_manifest = decode_hamming_projection_artifact_v1(raw_artifact)
            self.projection_artifact_backed = False
        self.hamming_proj = matrix.to(device=device)

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
