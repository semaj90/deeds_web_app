// CPU-only Boost.Graph challenger; fixture input is intentionally not live evidence.
// Compile: c++ -O2 -std=c++17 boost_graph_eval.cpp -o /tmp/atlas-boost-eval
#include <boost/graph/adjacency_list.hpp>
#include <boost/graph/breadth_first_search.hpp>
#include <boost/graph/visitors.hpp>
#include <iostream>
#include <vector>
#include <algorithm>
#include <chrono>
#include <cstdint>
using Graph=boost::adjacency_list<boost::vecS,boost::vecS,boost::directedS>;
struct Visitor : boost::default_bfs_visitor {
 std::vector<int>& distance;
 explicit Visitor(std::vector<int>& d):distance(d){}
 template<class Edge,class G> void tree_edge(Edge e,const G&g) const {
  distance[boost::target(e,g)]=distance[boost::source(e,g)]+1;
 }
};
int main(int argc,char**argv){
 if(argc!=3){std::cerr<<"usage: boost_graph_eval N ROUNDS\n";return 2;}
 const int n=std::stoi(argv[1]), rounds=std::stoi(argv[2]);
 if(n<2||n>200000||rounds<1||rounds>1000)return 2;
 Graph g(n);
 // Identical deterministic directed edges to the Python reference.
 for(int i=0;i<n;i++){boost::add_edge(i,(i+1)%n,g);if(i+2<n)boost::add_edge(i,i+2,g);}
 std::vector<int> d(n,-1);
 auto start=std::chrono::steady_clock::now();
 for(int r=0;r<rounds;r++){
  std::fill(d.begin(),d.end(),-1);d[0]=0;
  boost::breadth_first_search(g,boost::vertex(0,g),boost::visitor(Visitor(d)));
 }
 auto end=std::chrono::steady_clock::now();
 std::uint64_t checksum=0;
 for(size_t i=0;i<d.size();++i)checksum+=(std::uint64_t)(i+1)*(std::uint64_t)(d[i]+1);
 std::cout<<"{\"engine\":\"boost_graph\",\"n\":"<<n<<",\"rounds\":"<<rounds
          <<",\"distance_checksum\":"<<checksum<<",\"elapsed_ms\":"
          <<std::chrono::duration<double,std::milli>(end-start).count()<<"}\n";
}
