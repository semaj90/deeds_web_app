#include "bvh.h"
#include <emscripten/bind.h>
#include <emscripten/emscripten.h>
#include <vector>

using namespace emscripten;

// JavaScript-friendly wrapper for KNN search
class WasmKDTreeAccelerator {
private:
    bool indexBuilt;
    
public:
    WasmKDTreeAccelerator() : indexBuilt(false) {}
    
    ~WasmKDTreeAccelerator() {
        if (indexBuilt) {
            free_index();
        }
    }
    
    // Build index from JavaScript float array
    void buildIndex(const val& jsArray, int dimensions) {
        if (indexBuilt) {
            free_index();
            indexBuilt = false;
        }
        
        // Convert JavaScript array to C++ vector
        int length = jsArray["length"].as<int>();
        int numPoints = length / dimensions;
        
        std::vector<float> data(length);
        for (int i = 0; i < length; i++) {
            data[i] = jsArray[i].as<float>();
        }
        
        // Build the KD-tree index
        build_index(data.data(), dimensions, numPoints);
        indexBuilt = true;
    }
    
    // Search for K nearest neighbors
    val searchKNN(const val& queryArray, int k) {
        if (!indexBuilt) {
            return val::array();
        }
        
        int queryLength = queryArray["length"].as<int>();
        std::vector<float> query(queryLength);
        
        for (int i = 0; i < queryLength; i++) {
            query[i] = queryArray[i].as<float>();
        }
        
        // Perform the search
        int* results = knn_search(query.data(), k);
        if (!results) {
            return val::array();
        }
        
        // Convert results to JavaScript array
        val jsResults = val::array();
        for (int i = 0; i < k; i++) {
            jsResults.call<void>("push", results[i]);
        }
        
        // Clean up the results buffer
        free(results);
        
        return jsResults;
    }
    
    bool isIndexBuilt() const {
        return indexBuilt;
    }
};

// Emscripten bindings
EMSCRIPTEN_BINDINGS(cyber_elephant_accelerator) {
    class_<WasmKDTreeAccelerator>("WasmKDTreeAccelerator")
        .constructor<>()
        .function("buildIndex", &WasmKDTreeAccelerator::buildIndex)
        .function("searchKNN", &WasmKDTreeAccelerator::searchKNN)
        .function("isIndexBuilt", &WasmKDTreeAccelerator::isIndexBuilt);
}

// Main function (required but not used in WebAssembly)
int main() {
    return 0;
}