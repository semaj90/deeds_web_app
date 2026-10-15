#pragma once

#include <cstdint>

// Return codes for graph search
#define GRAPH_SEARCH_SUCCESS 0
#define GRAPH_SEARCH_ERR_INVALID_ARGS -1
#define GRAPH_SEARCH_ERR_BUFFER_TOO_SMALL -2
#define GRAPH_SEARCH_ERR_BUDGET_EXCEEDED -3
#define GRAPH_SEARCH_ERR_HEURISTIC_INVALID -4
#define GRAPH_SEARCH_ERR_EDGE_WEIGHT_INVALID -5
#define GRAPH_SEARCH_ERR_NO_PATH -6

extern "C" {

/**
 * Breadth-First Search on CSR Graph.
 * Matches Python graph_search_subhelpers_v1.bfs().
 */
int graphBFS(
    const int32_t* row_ptr, int32_t num_nodes,
    const int32_t* col_indices, int32_t num_edges,
    int32_t start_node, int32_t max_nodes,
    int32_t* out_path, int32_t out_capacity,
    int32_t* out_count
);

/**
 * Bounded BFS on CSR Graph with full distance, predecessor, depth, and edge scan budgets.
 */
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
);

/**
 * A* Search on CSR Graph with edge weights and heuristic.
 * Matches Python graph_search_subhelpers_v1.astar().
 */
int graphAStar(
    const int32_t* row_ptr, int32_t num_nodes,
    const int32_t* col_indices, int32_t num_edges,
    const float* edge_weights,
    const float* heuristics,
    int32_t start_node, int32_t goal_node,
    int32_t max_expansions,
    int32_t* out_path, int32_t out_capacity,
    int32_t* out_count
);

/**
 * Greedy Best-First Search on CSR Graph.
 * Matches Python graph_search_subhelpers_v1.greedy_best_first().
 */
int graphGreedySearch(
    const int32_t* row_ptr, int32_t num_nodes,
    const int32_t* col_indices, int32_t num_edges,
    const float* heuristics,
    int32_t start_node, int32_t goal_node,
    int32_t max_expansions,
    int32_t* out_path, int32_t out_capacity,
    int32_t* out_count
);

/**
 * Fast AST Linked-List Traversal (first_child / next_sibling).
 */
int traverseAstLinkedList(
    const int32_t* first_child,
    const int32_t* next_sibling,
    int32_t num_nodes,
    int32_t start_node,
    int32_t max_depth,
    int32_t* out_nodes, int32_t out_capacity,
    int32_t* out_count
);

}
