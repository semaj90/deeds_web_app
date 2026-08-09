#include <simdjson.h>
#include <fstream>
#include <iostream>
#include <string>
#include <unordered_set>

static std::string norm(std::string s) {
  for (auto &c:s) if (c=='\\') c='/';
  const std::string p="sveltekit-frontend/";
  if (s.rfind(p,0)==0) s.erase(0,p.size());
  while (s.rfind("./",0)==0) s.erase(0,2);
  return s;
}
int main(int argc,char**argv){
  if(argc<2){std::cerr<<"usage: simdjson_edge_scan <jsonl>\n";return 2;}
  std::ifstream in(argv[1]); if(!in)return 3;
  simdjson::dom::parser parser;
  std::unordered_set<std::string> uniq;
  uint64_t lines=0,imports=0,bad=0; std::string line;
  while(std::getline(in,line)){
    ++lines;
    try{
      auto d=parser.parse(line);
      std::string type=std::string(std::string_view(d["type"]));
      if(type!="imports_static" && type!="imports_dynamic" && type!="IMPORTS") continue;
      ++imports;
      std::string from=norm(std::string(std::string_view(d["from"])));
      std::string to=norm(std::string(std::string_view(d["to"])));
      uniq.insert(from+"\n"+to);
    }catch(...){++bad;}
  }
  std::cout<<"{\"lines\":"<<lines<<",\"importRecords\":"<<imports
           <<",\"uniqueImportPairs\":"<<uniq.size()<<",\"malformed\":"<<bad<<"}\n";
}
