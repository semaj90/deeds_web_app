#include "graph_search.h"
#include "native_execution_counters.h"

#include <vector>
#include <queue>
#include <cmath>
#include <algorithm>
#include <limits>

extern "C" {

int graphBFS(
    const int32_t* row_ptr, int32_t num_nodes,
    const int32_t* col_indices, int32_t num_edges,
    int32_t start_node, int32_t max_nodes,
    int32_t* out_path, int32_t out_capacity,
    int32_t* out_count
) {
  if (!row_ptr || !col_indices || !out_path || !out_count) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (num_nodes <= 0 || num_edges < 0) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (start_node < 0 || start_node >= num_nodes) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (max_nodes < 1 || max_nodes > 4096) return GRAPH_SEARCH_ERR_BUDGET_EXCEEDED;
  if (out_capacity < max_nodes) return GRAPH_SEARCH_ERR_BUFFER_TOO_SMALL;

  std::vector<bool> seen(static_cast<size_t>(num_nodes), false);
  std::vector<int32_t> queue;
  queue.reserve(static_cast<size_t>(max_nodes));

  seen[static_cast<size_t>(start_node)] = true;
  queue.push_back(start_node);

  size_t head = 0;
  while (head < queue.size() && static_cast<int32_t>(queue.size()) < max_nodes) {
    int32_t u = queue[head++];
    int32_t start_e = row_ptr[u];
    int32_t end_e = row_ptr[u + 1];

    if (start_e < 0 || end_e > num_edges || start_e > end_e) {
      return GRAPH_SEARCH_ERR_INVALID_ARGS;
    }

    // Collect and sort neighbors to ensure deterministic order matching Python sorted(set(adj[u]))
    std::vector<int32_t> neighbors;
    neighbors.reserve(static_cast<size_t>(end_e - start_e));
    for (int32_t e = start_e; e < end_e; ++e) {
      neighbors.push_back(col_indices[e]);
    }
    std::sort(neighbors.begin(), neighbors.end());
    neighbors.erase(std::unique(neighbors.begin(), neighbors.end()), neighbors.end());

    for (int32_t v : neighbors) {
      if (v >= 0 && v < num_nodes && !seen[static_cast<size_t>(v)]) {
        seen[static_cast<size_t>(v)] = true;
        queue.push_back(v);
        if (static_cast<int32_t>(queue.size()) >= max_nodes) break;
      }
    }
  }

  for (size_t i = 0; i < queue.size(); ++i) {
    out_path[i] = queue[i];
  }
  *out_count = static_cast<int32_t>(queue.size());
  atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
  return GRAPH_SEARCH_SUCCESS;
}

int graphBFSExtended(
    const int32_t* row_ptr, int32_t num_nodes,
    const int32_t* col_indices, int32_t num_edges,
    int32_t start_node,
    int32_t max_depth,
    int32_t max_visited,
    uint64_t max_edges_scanned,
    int32_t* out_visited, int32_t* out_visited_count,
    int32_t* out_distances,
    int32_t* out_predecessors,
    int32_t* out_truncated,
    uint64_t* out_edges_scanned
) {
  if (!row_ptr || !col_indices || !out_visited || !out_visited_count ||
      !out_distances || !out_predecessors || !out_truncated || !out_edges_scanned) {
    return GRAPH_SEARCH_ERR_INVALID_ARGS;
  }
  if (num_nodes <= 0 || num_edges < 0) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (start_node < 0 || start_node >= num_nodes) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (max_depth < 0) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (max_visited <= 0) return GRAPH_SEARCH_ERR_INVALID_ARGS;

  // Validate CSR structural invariants:
  // 1. row_ptr[0] == 0
  // 2. row_ptr[num_nodes] == num_edges
  // 3. row_ptr monotonically nondecreasing
  // 4. every col_indices[e] within [0, num_nodes - 1]
  if (row_ptr[0] != 0 || row_ptr[num_nodes] != num_edges) {
    return GRAPH_SEARCH_ERR_INVALID_ARGS;
  }
  for (int32_t i = 0; i < num_nodes; ++i) {
    if (row_ptr[i] > row_ptr[i + 1] || row_ptr[i + 1] > num_edges) {
      return GRAPH_SEARCH_ERR_INVALID_ARGS;
    }
  }
  for (int32_t e = 0; e < num_edges; ++e) {
    if (col_indices[e] < 0 || col_indices[e] >= num_nodes) {
      return GRAPH_SEARCH_ERR_INVALID_ARGS;
    }
  }

  // Initialize output buffers
  std::fill(out_distances, out_distances + num_nodes, -1);
  std::fill(out_predecessors, out_predecessors + num_nodes, -1);
  *out_visited_count = 0;
  *out_truncated = 0;
  *out_edges_scanned = 0;

  uint64_t edge_limit = (max_edges_scanned == 0) ? std::numeric_limits<uint64_t>::max() : max_edges_scanned;

  std::vector<int32_t> queue;
  queue.reserve(static_cast<size_t>(std::min(max_visited, num_nodes)));

  out_distances[start_node] = 0;
  out_predecessors[start_node] = -1;
  out_visited[(*out_visited_count)++] = start_node;
  queue.push_back(start_node);

  size_t head = 0;
  while (head < queue.size()) {
    int32_t u = queue[head++];
    int32_t u_dist = out_distances[u];

    int32_t start_e = row_ptr[u];
    int32_t end_e = row_ptr[u + 1];

    if (u_dist >= max_depth) {
      // u is at or beyond depth budget; inspect if it has unvisited outgoing neighbors
      for (int32_t e = start_e; e < end_e; ++e) {
        int32_t v = col_indices[e];
        if (out_distances[v] == -1) {
          *out_truncated = 1;
          break;
        }
      }
      continue;
    }

    std::vector<int32_t> neighbors;
    neighbors.reserve(static_cast<size_t>(end_e - start_e));

    for (int32_t e = start_e; e < end_e; ++e) {
      if (*out_edges_scanned >= edge_limit) {
        *out_truncated = 1;
        break;
      }
      (*out_edges_scanned)++;
      neighbors.push_back(col_indices[e]);
    }

    // Deterministic sort & deduplication
    std::sort(neighbors.begin(), neighbors.end());
    neighbors.erase(std::unique(neighbors.begin(), neighbors.end()), neighbors.end());

    for (int32_t v : neighbors) {
      if (out_distances[v] == -1) {
        if (*out_visited_count >= max_visited) {
          *out_truncated = 1;
          break;
        }
        out_distances[v] = u_dist + 1;
        out_predecessors[v] = u;
        out_visited[(*out_visited_count)++] = v;
        if (out_distances[v] < max_depth) {
          queue.push_back(v);
        } else {
          // If v is at max_depth, check if it has unvisited neighbors
          int32_t v_start = row_ptr[v];
          int32_t v_end = row_ptr[v + 1];
          for (int32_t ve = v_start; ve < v_end; ++ve) {
            int32_t nv = col_indices[ve];
            if (out_distances[nv] == -1 && nv != v) {
              *out_truncated = 1;
              break;
            }
          }
        }
      }
    }

    if (*out_truncated && (*out_visited_count >= max_visited || *out_edges_scanned >= edge_limit)) {
      break;
    }
  }

  atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
  return GRAPH_SEARCH_SUCCESS;
}

struct AStarPQItem {
  float f;
  float g;
  int32_t u;

  bool operator>(const AStarPQItem& other) const {
    if (f != other.f) return f > other.f;
    if (g != other.g) return g > other.g;
    return u > other.u; // Deterministic tie-breaking
  }
};

int graphAStar(
    const int32_t* row_ptr, int32_t num_nodes,
    const int32_t* col_indices, int32_t num_edges,
    const float* edge_weights,
    const float* heuristics,
    int32_t start_node, int32_t goal_node,
    int32_t max_expansions,
    int32_t* out_path, int32_t out_capacity,
    int32_t* out_count
) {
  if (!row_ptr || !col_indices || !edge_weights || !out_path || !out_count) {
    return GRAPH_SEARCH_ERR_INVALID_ARGS;
  }
  if (num_nodes <= 0 || num_edges < 0) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (start_node < 0 || start_node >= num_nodes) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (goal_node < 0 || goal_node >= num_nodes) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (max_expansions < 1 || max_expansions > 100000) return GRAPH_SEARCH_ERR_BUDGET_EXCEEDED;

  // Validate heuristics
  if (heuristics) {
    for (int32_t i = 0; i < num_nodes; ++i) {
      if (!std::isfinite(heuristics[i]) || heuristics[i] < 0.0f) {
        return GRAPH_SEARCH_ERR_HEURISTIC_INVALID;
      }
    }
  }
  // Validate edge weights
  for (int32_t e = 0; e < num_edges; ++e) {
    if (!std::isfinite(edge_weights[e]) || edge_weights[e] < 0.0f) {
      return GRAPH_SEARCH_ERR_EDGE_WEIGHT_INVALID;
    }
  }

  std::priority_queue<AStarPQItem, std::vector<AStarPQItem>, std::greater<AStarPQItem>> pq;
  std::vector<float> costs(static_cast<size_t>(num_nodes), std::numeric_limits<float>::infinity());
  std::vector<int32_t> parent(static_cast<size_t>(num_nodes), -1);

  costs[static_cast<size_t>(start_node)] = 0.0f;
  float h_start = heuristics ? heuristics[start_node] : 0.0f;
  pq.push({h_start, 0.0f, start_node});

  int32_t expanded = 0;
  while (!pq.empty() && expanded < max_expansions) {
    auto top = pq.top();
    pq.pop();
    float g = top.g;
    int32_t u = top.u;

    if (g > costs[static_cast<size_t>(u)]) continue;
    expanded++;

    if (u == goal_node) {
      std::vector<int32_t> path;
      int32_t curr = goal_node;
      while (curr != -1) {
        path.push_back(curr);
        if (curr == start_node) break;
        curr = parent[static_cast<size_t>(curr)];
      }
      std::reverse(path.begin(), path.end());

      if (out_capacity < static_cast<int32_t>(path.size())) {
        return GRAPH_SEARCH_ERR_BUFFER_TOO_SMALL;
      }
      for (size_t i = 0; i < path.size(); ++i) {
        out_path[i] = path[i];
      }
      *out_count = static_cast<int32_t>(path.size());
      atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
      return GRAPH_SEARCH_SUCCESS;
    }

    int32_t start_e = row_ptr[u];
    int32_t end_e = row_ptr[u + 1];

    // Collect neighbors sorted by node ID for deterministic traversal
    struct EdgePair { int32_t v; float w; };
    std::vector<EdgePair> edges;
    edges.reserve(static_cast<size_t>(end_e - start_e));
    for (int32_t e = start_e; e < end_e; ++e) {
      edges.push_back({col_indices[e], edge_weights[e]});
    }
    std::sort(edges.begin(), edges.end(), [](const EdgePair& a, const EdgePair& b) {
      return a.v < b.v;
    });

    for (const auto& edge : edges) {
      int32_t v = edge.v;
      float w = edge.w;
      if (v < 0 || v >= num_nodes) continue;

      float cand = g + w;
      if (cand < costs[static_cast<size_t>(v)]) {
        costs[static_cast<size_t>(v)] = cand;
        parent[static_cast<size_t>(v)] = u;
        float h_v = heuristics ? heuristics[v] : 0.0f;
        pq.push({cand + h_v, cand, v});
      }
    }
  }

  *out_count = 0;
  return GRAPH_SEARCH_ERR_NO_PATH;
}

struct GreedyPQItem {
  float h;
  int32_t u;

  bool operator>(const GreedyPQItem& other) const {
    if (h != other.h) return h > other.h;
    return u > other.u; // Deterministic tie-breaking
  }
};

int graphGreedySearch(
    const int32_t* row_ptr, int32_t num_nodes,
    const int32_t* col_indices, int32_t num_edges,
    const float* heuristics,
    int32_t start_node, int32_t goal_node,
    int32_t max_expansions,
    int32_t* out_path, int32_t out_capacity,
    int32_t* out_count
) {
  if (!row_ptr || !col_indices || !heuristics || !out_path || !out_count) {
    return GRAPH_SEARCH_ERR_INVALID_ARGS;
  }
  if (num_nodes <= 0 || num_edges < 0) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (start_node < 0 || start_node >= num_nodes) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (goal_node < 0 || goal_node >= num_nodes) return GRAPH_SEARCH_ERR_INVALID_ARGS;
  if (max_expansions < 1 || max_expansions > 100000) return GRAPH_SEARCH_ERR_BUDGET_EXCEEDED;

  for (int32_t i = 0; i < num_nodes; ++i) {
    if (!std::isfinite(heuristics[i]) || heuristics[i] < 0.0f) {
      return GRAPH_SEARCH_ERR_HEURISTIC_INVALID;
    }
  }

  std::priority_queue<GreedyPQItem, std::vector<GreedyPQItem>, std::greater<GreedyPQItem>> pq;
  std::vector<bool> seen(static_cast<size_t>(num_nodes), false);
  std::vector<int32_t> parent(static_cast<size_t>(num_nodes), -1);

  pq.push({heuristics[start_node], start_node});

  int32_t expanded = 0;
  while (!pq.empty() && expanded < max_expansions) {
    auto top = pq.top();
    pq.pop();
    int32_t u = top.u;

    if (seen[static_cast<size_t>(u)]) continue;
    seen[static_cast<size_t>(u)] = true;
    expanded++;

    if (u == goal_node) {
      std::vector<int32_t> path;
      int32_t curr = goal_node;
      while (curr != -1) {
        path.push_back(curr);
        if (curr == start_node) break;
        curr = parent[static_cast<size_t>(curr)];
      }
      std::reverse(path.begin(), path.end());

      if (out_capacity < static_cast<int32_t>(path.size())) {
        return GRAPH_SEARCH_ERR_BUFFER_TOO_SMALL;
      }
      for (size_t i = 0; i < path.size(); ++i) {
        out_path[i] = path[i];
      }
      *out_count = static_cast<int32_t>(path.size());
      atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
      return GRAPH_SEARCH_SUCCESS;
    }

    int32_t start_e = row_ptr[u];
    int32_t end_e = row_ptr[u + 1];

    std::vector<int32_t> neighbors;
    neighbors.reserve(static_cast<size_t>(end_e - start_e));
    for (int32_t e = start_e; e < end_e; ++e) {
      neighbors.push_back(col_indices[e]);
    }
    std::sort(neighbors.begin(), neighbors.end());
    neighbors.erase(std::unique(neighbors.begin(), neighbors.end()), neighbors.end());

    for (int32_t v : neighbors) {
      if (v >= 0 && v < num_nodes) {
        if (!seen[static_cast<size_t>(v)] && parent[static_cast<size_t>(v)] == -1 && v != start_node) {
          parent[static_cast<size_t>(v)] = u;
          pq.push({heuristics[v], v});
        }
      }
    }
  }

  *out_count = 0;
  return GRAPH_SEARCH_ERR_NO_PATH;
}

int traverseAstLinkedList(
    const int32_t* first_child,
    const int32_t* next_sibling,
    int32_t num_nodes,
    int32_t start_node,
    int32_t max_depth,
    int32_t* out_nodes, int32_t out_capacity,
    int32_t* out_count
) {
  if (!first_child || !next_sibling || !out_nodes || !out_count) {
    return GRAPH_SEARCH_ERR_INVALID_ARGS;
  }
  if (num_nodes <= 0 || start_node < 0 || start_node >= num_nodes) {
    return GRAPH_SEARCH_ERR_INVALID_ARGS;
  }
  if (max_depth < 0 || out_capacity <= 0) return GRAPH_SEARCH_ERR_INVALID_ARGS;

  struct StackFrame {
    int32_t node;
    int32_t depth;
  };

  std::vector<StackFrame> stack;
  stack.push_back({start_node, 0});
  int32_t count = 0;

  while (!stack.empty() && count < out_capacity) {
    StackFrame curr = stack.back();
    stack.pop_back();

    out_nodes[count++] = curr.node;

    if (curr.depth < max_depth) {
      // First push siblings, then children (DFS preorder)
      int32_t child = first_child[curr.node];
      if (child >= 0 && child < num_nodes) {
        // Collect all siblings of child
        std::vector<int32_t> siblings;
        int32_t s = child;
        while (s >= 0 && s < num_nodes) {
          siblings.push_back(s);
          s = next_sibling[s];
        }
        // Push in reverse so earliest sibling pops first
        for (auto it = siblings.rbegin(); it != siblings.rend(); ++it) {
          stack.push_back({*it, curr.depth + 1});
        }
      }
    }
  }

  *out_count = count;
  atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
  return GRAPH_SEARCH_SUCCESS;
}

}
