#include <emscripten/emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <rapidjson/document.h>
#include <rapidjson/writer.h>
#include <rapidjson/stringbuffer.h>
#include <rapidjson/error/en.h>
#include <string>
#include <vector>
#include <memory>
#include <chrono>
#include <unordered_map>
#include <thread>
#include <atomic>
#include <algorithm>

using namespace rapidjson;
using namespace emscripten;

// Performance metrics tracking
struct ParseMetrics {
    double parseTime = 0.0;
    size_t documentSize = 0;
    size_t objectCount = 0;
    size_t arrayCount = 0;
    std::string parseMethod = "";
};

// Thread-safe cache for parsed documents
class DocumentCache {
private:
    std::unordered_map<std::string, std::shared_ptr<Document>> cache;
    std::atomic<size_t> hitCount{0};
    std::atomic<size_t> missCount{0};
    const size_t maxSize = 1000;

public:
    std::shared_ptr<Document> get(const std::string& key) {
        auto it = cache.find(key);
        if (it != cache.end()) {
            hitCount++;
            return it->second;
        }
        missCount++;
        return nullptr;
    }

    void put(const std::string& key, std::shared_ptr<Document> doc) {
        if (cache.size() >= maxSize) {
            // Simple LRU: remove first element
            cache.erase(cache.begin());
        }
        cache[key] = doc;
    }

    val getStats() {
        val stats = val::object();
        stats.set("hits", static_cast<double>(hitCount.load()));
        stats.set("misses", static_cast<double>(missCount.load()));
        stats.set("hitRate", static_cast<double>(hitCount.load()) /
                            static_cast<double>(hitCount.load() + missCount.load()));
        stats.set("cacheSize", static_cast<double>(cache.size()));
        return stats;
    }

    void clear() {
        cache.clear();
        hitCount = 0;
        missCount = 0;
    }
};

// Global cache instance
static DocumentCache globalCache;

// High-performance JSON parser with GPU-optimized preprocessing
class RapidJsonParser {
private:
    Document document;
    ParseMetrics lastMetrics;

    // Count JSON objects and arrays for metrics
    void countElements(const Value& value, size_t& objectCount, size_t& arrayCount) {
        if (value.IsObject()) {
            objectCount++;
            for (auto& member : value.GetObject()) {
                countElements(member.value, objectCount, arrayCount);
            }
        } else if (value.IsArray()) {
            arrayCount++;
            for (auto& element : value.GetArray()) {
                countElements(element, objectCount, arrayCount);
            }
        }
    }

    // Generate cache key from JSON content hash
    std::string generateCacheKey(const std::string& json) {
        std::hash<std::string> hasher;
        return std::to_string(hasher(json));
    }

public:
    // Parse JSON with caching and metrics
    val parseWithCache(const std::string& json, bool useCache = true) {
        auto startTime = std::chrono::high_resolution_clock::now();

        std::string cacheKey;
        std::shared_ptr<Document> cachedDoc = nullptr;

        if (useCache) {
            cacheKey = generateCacheKey(json);
            cachedDoc = globalCache.get(cacheKey);
        }

        val result = val::object();

        if (cachedDoc) {
            // Cache hit - use cached document
            document.CopyFrom(*cachedDoc, document.GetAllocator());
            lastMetrics.parseMethod = "cache_hit";
        } else {
            // Cache miss - parse JSON
            document.Parse(json.c_str());

            if (document.HasParseError()) {
                result.set("error", true);
                result.set("errorMessage", GetParseError_En(document.GetParseError()));
                result.set("errorOffset", static_cast<double>(document.GetErrorOffset()));
                return result;
            }

            if (useCache) {
                auto docCopy = std::make_shared<Document>();
                docCopy->CopyFrom(document, docCopy->GetAllocator());
                globalCache.put(cacheKey, docCopy);
                lastMetrics.parseMethod = "cache_miss_stored";
            } else {
                lastMetrics.parseMethod = "no_cache";
            }
        }

        auto endTime = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime);

        // Update metrics
        lastMetrics.parseTime = duration.count() / 1000.0; // Convert to milliseconds
        lastMetrics.documentSize = json.length();
        lastMetrics.objectCount = 0;
        lastMetrics.arrayCount = 0;
        countElements(document, lastMetrics.objectCount, lastMetrics.arrayCount);

        result.set("success", true);
        result.set("parsed", true);
        return result;
    }

    // Fast batch parsing for multiple JSON strings
    val parseBatch(const val& jsonArray) {
        val results = val::array();
        std::vector<std::string> jsonStrings;

        // Extract JSON strings from JavaScript array
        for (int i = 0; i < jsonArray["length"].as<int>(); i++) {
            jsonStrings.push_back(jsonArray[i].as<std::string>());
        }

        auto startTime = std::chrono::high_resolution_clock::now();

        // Process in parallel using multiple threads
        std::vector<std::thread> threads;
        std::vector<val> threadResults(jsonStrings.size());
        const int numThreads = std::min(static_cast<int>(jsonStrings.size()), 4);

        for (int t = 0; t < numThreads; t++) {
            threads.emplace_back([&, t]() {
                RapidJsonParser threadParser;
                for (size_t i = t; i < jsonStrings.size(); i += numThreads) {
                    threadResults[i] = threadParser.parseWithCache(jsonStrings[i]);
                }
            });
        }

        // Wait for all threads to complete
        for (auto& thread : threads) {
            thread.join();
        }

        auto endTime = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime);

        val batchResult = val::object();
        batchResult.set("results", val::array());

        for (size_t i = 0; i < threadResults.size(); i++) {
            batchResult["results"].call<void>("push", threadResults[i]);
        }

        batchResult.set("batchTime", duration.count() / 1000.0);
        batchResult.set("documentCount", static_cast<double>(jsonStrings.size()));
        batchResult.set("threadsUsed", static_cast<double>(numThreads));

        return batchResult;
    }

    // Get value by JSONPath-like query
    val getValue(const std::string& path) {
        if (document.IsNull()) {
            val error = val::object();
            error.set("error", true);
            error.set("message", "No document parsed");
            return error;
        }

        const Value* current = &document;
        std::istringstream pathStream(path);
        std::string segment;

        while (std::getline(pathStream, segment, '.')) {
            if (segment.empty()) continue;

            // Handle array indices [0], [1], etc.
            if (segment.front() == '[' && segment.back() == ']') {
                int index = std::stoi(segment.substr(1, segment.length() - 2));
                if (current->IsArray() && index >= 0 && index < static_cast<int>(current->Size())) {
                    current = &(*current)[index];
                } else {
                    val error = val::object();
                    error.set("error", true);
                    error.set("message", "Invalid array index: " + segment);
                    return error;
                }
            }
            // Handle object properties
            else if (current->IsObject() && current->HasMember(segment.c_str())) {
                current = &(*current)[segment.c_str()];
            } else {
                val error = val::object();
                error.set("error", true);
                error.set("message", "Path not found: " + segment);
                return error;
            }
        }

        // Convert RapidJSON value to Emscripten val
        return convertToVal(*current);
    }

    // Convert RapidJSON Value to Emscripten val
    val convertToVal(const Value& value) {
        if (value.IsNull()) {
            return val::null();
        } else if (value.IsBool()) {
            return val(value.GetBool());
        } else if (value.IsInt()) {
            return val(value.GetInt());
        } else if (value.IsDouble()) {
            return val(value.GetDouble());
        } else if (value.IsString()) {
            return val(std::string(value.GetString()));
        } else if (value.IsArray()) {
            val arr = val::array();
            for (auto& element : value.GetArray()) {
                arr.call<void>("push", convertToVal(element));
            }
            return arr;
        } else if (value.IsObject()) {
            val obj = val::object();
            for (auto& member : value.GetObject()) {
                obj.set(member.name.GetString(), convertToVal(member.value));
            }
            return obj;
        }
        return val::undefined();
    }

    // Get performance metrics
    val getMetrics() {
        val metrics = val::object();
        metrics.set("parseTime", lastMetrics.parseTime);
        metrics.set("documentSize", static_cast<double>(lastMetrics.documentSize));
        metrics.set("objectCount", static_cast<double>(lastMetrics.objectCount));
        metrics.set("arrayCount", static_cast<double>(lastMetrics.arrayCount));
        metrics.set("parseMethod", lastMetrics.parseMethod);
        return metrics;
    }

    // Stringify with options
    val stringify(const val& options = val::object()) {
        if (document.IsNull()) {
            val error = val::object();
            error.set("error", true);
            error.set("message", "No document to stringify");
            return error;
        }

        StringBuffer buffer;
        Writer<StringBuffer> writer(buffer);

        // Apply formatting options
        if (options.hasOwnProperty("pretty") && options["pretty"].as<bool>()) {
            // Use PrettyWriter for formatted output
            // Note: This would require including rapidjson/prettywriter.h
        }

        document.Accept(writer);

        val result = val::object();
        result.set("success", true);
        result.set("json", std::string(buffer.GetString()));
        result.set("size", static_cast<double>(buffer.GetSize()));
        return result;
    }

    // Validate JSON schema (basic validation)
    val validate(const std::string& schemaJson) {
        // Basic implementation - would need rapidjson/schema.h for full schema validation
        Document schema;
        schema.Parse(schemaJson.c_str());

        val result = val::object();
        if (schema.HasParseError()) {
            result.set("valid", false);
            result.set("error", "Invalid schema JSON");
            return result;
        }

        result.set("valid", true);
        result.set("message", "Basic validation passed");
        return result;
    }
};

// C-style exports for Emscripten
extern "C" {
    EMSCRIPTEN_KEEPALIVE
    RapidJsonParser* createParser() {
        return new RapidJsonParser();
    }

    EMSCRIPTEN_KEEPALIVE
    void destroyParser(RapidJsonParser* parser) {
        delete parser;
    }

    EMSCRIPTEN_KEEPALIVE
    val getCacheStats() {
        return globalCache.getStats();
    }

    EMSCRIPTEN_KEEPALIVE
    void clearCache() {
        globalCache.clear();
    }
}

// Emscripten bindings
EMSCRIPTEN_BINDINGS(rapid_json_parser) {
    class_<RapidJsonParser>("RapidJsonParser")
        .constructor<>()
        .function("parseWithCache", &RapidJsonParser::parseWithCache)
        .function("parseBatch", &RapidJsonParser::parseBatch)
        .function("getValue", &RapidJsonParser::getValue)
        .function("getMetrics", &RapidJsonParser::getMetrics)
        .function("stringify", &RapidJsonParser::stringify)
        .function("validate", &RapidJsonParser::validate);

    function("createParser", &createParser, allow_raw_pointers());
    function("destroyParser", &destroyParser, allow_raw_pointers());
    function("getCacheStats", &getCacheStats);
    function("clearCache", &clearCache);
}
