#include "bvh.h"
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <limits>
#include <queue>
#include <vector>

struct KDNode {
  int index; // original point index
  int left;  // index into g_nodes vector, -1 = none
  int right; // index into g_nodes vector
  int axis;  // split axis
};

static float *g_data = nullptr;
static int g_n = 0;
static int g_dim = 0;
static std::vector<KDNode> g_nodes; // tree nodes
static int g_root = -1; // index of the root node in g_nodes, -1 = none

static int build_rec(std::vector<int> &idxs, int l, int r, int depth) {
  if (l > r) {
    return -1;
  }
  int axis = depth % g_dim;
  int m = (l + r) >> 1;
  auto cmp = [axis](int a, int b) {
    return g_data[(a * g_dim) + axis] < g_data[(b * g_dim) + axis];
  };
  std::nth_element(idxs.begin() + l, idxs.begin() + m, idxs.begin() + r + 1,
                   cmp);

  // create node and reserve its index
  KDNode node;
  node.index = idxs[m];
  node.axis = axis;
  node.left = -1;
  node.right = -1;
  int nodeIdx = (int)g_nodes.size();
  g_nodes.push_back(node);

  // build children
  int left = build_rec(idxs, l, m - 1, depth + 1);
  int right = build_rec(idxs, m + 1, r, depth + 1);
  g_nodes[nodeIdx].left = left;
  g_nodes[nodeIdx].right = right;

  return nodeIdx;
}

void build_index(const float *data, int dim, int n) {
  // free previous
  if (g_data != nullptr) {
    free(g_data);
    g_data = nullptr;
  }
  g_dim = dim;
  g_n = n;
  g_root = -1;
  if (n <= 0 || dim <= 0) {
    return;
  }
  g_data = (float *)malloc(sizeof(float) * n * dim);
  if (!g_data) {
    // allocation failed
    g_n = 0;
    g_dim = 0;
    return;
  }
  memcpy(g_data, data, sizeof(float) * n * dim);

  // build index list
  std::vector<int> idxs(n);
  for (int i = 0; i < n; ++i) {
    idxs[i] = i;
  }
  g_nodes.clear();
  g_nodes.reserve(n);
  int root = build_rec(idxs, 0, n - 1, 0);
  g_root = root;
}

// Helper: squared euclidean distance
static inline float dist2(const float *a, const float *b, int dim) {
  float s = 0.0F;
  for (int i = 0; i < dim; ++i) {
    float d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

int *knn_search(const float *query, int k) {
  if (g_data == nullptr || g_n == 0 || g_dim == 0) {
    return nullptr;
  }
  if (k <= 0) {
    return nullptr;
  }
  // max-heap of pairs (distance, index) so top() is farthest
  using Pair = std::pair<float, int>;
  auto cmp = [](const Pair &a, const Pair &b) { return a.first < b.first; };
  std::priority_queue<Pair, std::vector<Pair>, decltype(cmp)> heap(cmp);

  // recursive search
  std::function<void(int)> search = [&](int nodeIdx) {
    if (nodeIdx < 0 || nodeIdx >= (int)g_nodes.size()) {
      return;
    }
    const KDNode &node = g_nodes[nodeIdx];
    const float *point = &g_data[node.index * g_dim];
    float d2 = dist2(point, query, g_dim);
    if ((int)heap.size() < k) {
      heap.emplace(d2, node.index);
    } else if (d2 < heap.top().first) {
      heap.pop();
      heap.emplace(d2, node.index);
    }

    int axis = node.axis;
    float diff = query[axis] - point[axis];
    int first = diff <= 0 ? node.left : node.right;
    int second = diff <= 0 ? node.right : node.left;

    if (first != -1) {
      search(first);
    }

    float diff2 = diff * diff;
    if (second != -1 && ((int)heap.size() < k || diff2 < heap.top().first)) {
      search(second);
    }
  };

  if (g_root < 0 || g_nodes.empty()) {
    return nullptr;
  }
  search(g_root);

  int outk = std::min(k, (int)heap.size());
  int *out = (int *)malloc(sizeof(int) * outk);
  if (!out)
    return nullptr;

  // heap contains farthest at top; pop to tmp to reverse order to nearest-first
  std::vector<int> tmp;
  tmp.reserve(outk);
  while (!heap.empty() && (int)tmp.size() < outk) {
    tmp.push_back(heap.top().second);
    heap.pop();
  }
  for (int i = 0; i < outk; ++i) {
    out[i] = tmp[outk - 1 - i];
  }
  return out;
}

void free_index() {
  if (g_data) {
    free(g_data);
    g_data = nullptr;
  }
  g_n = 0;
  g_dim = 0;
  g_nodes.clear();
  g_root = -1;
}
