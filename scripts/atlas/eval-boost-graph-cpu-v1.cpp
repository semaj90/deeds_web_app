// Optional Boost.Graph CPU challenger. No Node addon, RPC, stores or GPU.
// Input: bounded whitespace-separated "src dst" ordinal edges on stdin.
// Output: BFS depths from node 0, one integer per vertex (-1 unreachable).
// Only compile if locally installed Boost headers are available.
#include <boost/graph/adjacency_list.hpp>
#include <boost/graph/breadth_first_search.hpp>
#include <boost/graph/visitors.hpp>
#include <boost/property_map/property_map.hpp>
#include <cstddef>
#include <iostream>
#include <limits>
#include <queue>
#include <stdexcept>
#include <vector>
int main() {
  try {
    std::size_t n, m;
    if (!(std::cin >> n >> m) || n == 0 || n > 100000 || m > 1000000)
      throw std::runtime_error("INVALID_GRAPH_BOUNDS");
    using Graph=boost::adjacency_list<boost::vecS,boost::vecS,boost::directedS>;
    Graph g(n);
    for(std::size_t i=0;i<m;i++){
      std::size_t a,b;
      if(!(std::cin>>a>>b)||a>=n||b>=n)throw std::runtime_error("INVALID_EDGE");
      boost::add_edge(a,b,g);
    }
    // Reference BFS uses outgoing relation->participant edges only.
    std::vector<int> distance(n,-1);
    std::queue<std::size_t> pending;
    distance[0]=0;pending.push(0);
    while(!pending.empty()){
      auto u=pending.front();pending.pop();
      auto [first,last]=boost::out_edges(u,g);
      for(auto it=first;it!=last;++it){
        auto v=boost::target(*it,g);
        if(distance[v]!=-1)continue;
        distance[v]=distance[u]+1;pending.push(v);
      }
    }
    for(const auto d:distance)std::cout<<d<<"\n";
    return 0;
  } catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 2;}
}
