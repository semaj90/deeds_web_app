// legal_grpc_client.cpp - WebAssembly gRPC-Web client for legal CUDA streaming
#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/fetch.h>

#include "legal_cuda_streaming.grpc.pb.h"
#include <grpcpp/grpcpp.h>
#include <grpc/support/log.h>

#include <memory>
#include <string>
#include <vector>
#include <functional>
#include <thread>
#include <atomic>
#include <queue>
#include <mutex>

using grpc::Channel;
using grpc::ClientContext;
using grpc::ClientReader;
using grpc::ClientReaderWriter;
using grpc::Status;

namespace legal_cuda_streaming {

class LegalGrpcWebClient {
private:
    std::unique_ptr<LegalCudaService::Stub> stub_;
    std::shared_ptr<Channel> channel_;
    std::atomic<bool> connected_{false};
    std::string server_endpoint_;
    
    // Callback management
    std::function<void(const std::string&)> response_callback_;
    std::function<void(const std::string&)> error_callback_;
    std::function<void()> completion_callback_;
    
    // Active streaming contexts
    struct StreamContext {
        std::unique_ptr<ClientContext> context;
        std::unique_ptr<ClientReaderWriter<CudaRequest, CudaResponse>> stream;
        std::atomic<bool> active{false};
        std::string session_id;
    };
    
    std::map<std::string, std::unique_ptr<StreamContext>> active_streams_;
    std::mutex streams_mutex_;

public:
    LegalGrpcWebClient(const std::string& endpoint) : server_endpoint_(endpoint) {
        // Create gRPC-Web channel
        grpc::ChannelArguments args;
        args.SetString("grpc.http2.method", "POST");
        args.SetString("grpc.http2.scheme", "https");
        
        channel_ = grpc::CreateCustomChannel(
            endpoint,
            grpc::InsecureChannelCredentials(),
            args
        );
        
        stub_ = LegalCudaService::NewStub(channel_);
        connected_ = true;
        
        EM_ASM({
            console.log('🚀 Legal gRPC-Web Client initialized for endpoint: ' + 
                       UTF8ToString($0));
        }, endpoint.c_str());
    }
    
    // JavaScript-accessible methods
    void setResponseCallback(emscripten::val callback) {
        response_callback_ = [callback](const std::string& response) {
            callback(response);
        };
    }
    
    void setErrorCallback(emscripten::val callback) {
        error_callback_ = [callback](const std::string& error) {
            callback(error);
        };
    }
    
    void setCompletionCallback(emscripten::val callback) {
        completion_callback_ = [callback]() {
            callback();
        };
    }
    
    // Start bidirectional streaming session
    std::string startBidirectionalStream(const std::string& session_id) {
        std::lock_guard<std::mutex> lock(streams_mutex_);
        
        auto context = std::make_unique<StreamContext>();
        context->context = std::make_unique<ClientContext>();
        context->session_id = session_id;
        context->stream = stub_->BidirectionalLegalStream(context->context.get());
        context->active = true;
        
        // Start reading responses in a separate thread (emulated with async)
        std::thread([this, session_id]() {
            readStreamResponses(session_id);
        }).detach();
        
        active_streams_[session_id] = std::move(context);
        
        EM_ASM({
            console.log('📡 Started bidirectional stream for session: ' + 
                       UTF8ToString($0));
        }, session_id.c_str());
        
        return session_id;
    }
    
    // Send embedding request
    bool sendEmbeddingRequest(const std::string& session_id, 
                             const std::string& text, 
                             bool is_final = false) {
        std::lock_guard<std::mutex> lock(streams_mutex_);
        
        auto it = active_streams_.find(session_id);
        if (it == active_streams_.end() || !it->second->active) {
            return false;
        }
        
        CudaRequest request;
        request.set_session_id(session_id);
        request.set_operation_type("embed");
        request.set_raw_text(text);
        request.set_is_final_chunk(is_final);
        
        // Set CUDA options
        auto* cuda_options = request.mutable_cuda_options();
        cuda_options->set_use_tensor_cores(true);
        cuda_options->set_batch_size(1);
        cuda_options->set_enable_memory_pool(true);
        
        bool success = it->second->stream->Write(request);
        
        if (is_final) {
            it->second->stream->WritesDone();
        }
        
        return success;
    }
    
    // Send search request
    bool sendSearchRequest(const std::string& session_id,
                          const std::vector<float>& embedding_vector,
                          bool is_final = true) {
        std::lock_guard<std::mutex> lock(streams_mutex_);
        
        auto it = active_streams_.find(session_id);
        if (it == active_streams_.end() || !it->second->active) {
            return false;
        }
        
        CudaRequest request;
        request.set_session_id(session_id);
        request.set_operation_type("search");
        request.set_is_final_chunk(is_final);
        
        for (float val : embedding_vector) {
            request.add_embedding_vector(val);
        }
        
        return it->second->stream->Write(request);
    }
    
    // Document processing (non-streaming)
    void processLegalDocument(const std::string& document_id,
                             const std::string& document_content,
                             const std::string& document_type,
                             emscripten::val progress_callback) {
        
        DocumentRequest request;
        request.set_document_id(document_id);
        request.set_document_content(document_content);
        request.set_document_type(document_type);
        
        // Set processing flags
        auto* flags = request.mutable_flags();
        flags->set_extract_entities(true);
        flags->set_generate_summary(true);
        flags->set_compute_embeddings(true);
        flags->set_analyze_sentiment(true);
        flags->set_detect_clauses(document_type == "contract");
        
        ClientContext context;
        std::unique_ptr<ClientReader<DocumentResponse>> reader(
            stub_->ProcessLegalDocument(&context, request));
        
        // Process streaming responses
        std::thread([reader = std::move(reader), progress_callback]() mutable {
            DocumentResponse response;
            while (reader->Read(&response)) {
                // Convert response to JSON for JavaScript
                std::string json_response = documentResponseToJson(response);
                
                EM_ASM({
                    var callback = Module['getObject']($0);
                    var response = JSON.parse(UTF8ToString($1));
                    callback(response);
                }, progress_callback.as_handle(), json_response.c_str());
            }
            
            Status status = reader->Finish();
            if (!status.ok()) {
                EM_ASM({
                    console.error('Document processing failed: ' + 
                                 UTF8ToString($0));
                }, status.error_message().c_str());
            }
        }).detach();
    }
    
    // Semantic search (streaming)
    void performSemanticSearch(const std::string& query,
                              const std::string& collection_name,
                              int top_k,
                              emscripten::val results_callback) {
        
        SearchRequest request;
        request.set_query(query);
        request.set_collection_name(collection_name);
        request.set_top_k(top_k);
        request.set_enable_reranking(true);
        
        // Set search filters
        auto* filters = request.mutable_filters();
        // Add default filters if needed
        
        ClientContext context;
        std::unique_ptr<ClientReader<SearchResponse>> reader(
            stub_->StreamSemanticSearch(&context, request));
        
        // Process streaming search results
        std::thread([reader = std::move(reader), results_callback]() mutable {
            SearchResponse response;
            while (reader->Read(&response)) {
                std::string json_response = searchResponseToJson(response);
                
                EM_ASM({
                    var callback = Module['getObject']($0);
                    var response = JSON.parse(UTF8ToString($1));
                    callback(response);
                }, results_callback.as_handle(), json_response.c_str());
            }
            
            Status status = reader->Finish();
            if (!status.ok()) {
                EM_ASM({
                    console.error('Semantic search failed: ' + 
                                 UTF8ToString($0));
                }, status.error_message().c_str());
            }
        }).detach();
    }
    
    // Case similarity analysis
    void analyzeCaseSimilarity(const std::string& base_case_id,
                              const std::vector<std::string>& compare_case_ids,
                              emscripten::val similarity_callback) {
        
        SimilarityRequest request;
        request.set_base_case_id(base_case_id);
        
        for (const auto& case_id : compare_case_ids) {
            request.add_compare_case_ids(case_id);
        }
        
        // Set similarity metrics
        auto* metrics = request.mutable_requested_metrics();
        metrics->set_factual_similarity(true);
        metrics->set_legal_precedent_similarity(true);
        metrics->set_outcome_similarity(true);
        metrics->set_procedural_similarity(true);
        
        ClientContext context;
        std::unique_ptr<ClientReader<SimilarityResponse>> reader(
            stub_->AnalyzeCaseSimilarity(&context, request));
        
        // Process streaming similarity results
        std::thread([reader = std::move(reader), similarity_callback]() mutable {
            SimilarityResponse response;
            while (reader->Read(&response)) {
                std::string json_response = similarityResponseToJson(response);
                
                EM_ASM({
                    var callback = Module['getObject']($0);
                    var response = JSON.parse(UTF8ToString($1));
                    callback(response);
                }, similarity_callback.as_handle(), json_response.c_str());
            }
            
            Status status = reader->Finish();
            if (!status.ok()) {
                EM_ASM({
                    console.error('Case similarity analysis failed: ' + 
                                 UTF8ToString($0));
                }, status.error_message().c_str());
            }
        }).detach();
    }
    
    // Close streaming session
    bool closeStream(const std::string& session_id) {
        std::lock_guard<std::mutex> lock(streams_mutex_);
        
        auto it = active_streams_.find(session_id);
        if (it != active_streams_.end()) {
            it->second->active = false;
            it->second->stream->WritesDone();
            Status status = it->second->stream->Finish();
            
            active_streams_.erase(it);
            
            EM_ASM({
                console.log('🔌 Closed stream for session: ' + UTF8ToString($0));
            }, session_id.c_str());
            
            return status.ok();
        }
        
        return false;
    }
    
    // Connection status
    bool isConnected() const {
        return connected_;
    }

private:
    void readStreamResponses(const std::string& session_id) {
        std::lock_guard<std::mutex> lock(streams_mutex_);
        
        auto it = active_streams_.find(session_id);
        if (it == active_streams_.end()) return;
        
        CudaResponse response;
        while (it->second->active && it->second->stream->Read(&response)) {
            if (response_callback_) {
                std::string json_response = cudaResponseToJson(response);
                response_callback_(json_response);
            }
        }
        
        Status status = it->second->stream->Finish();
        if (!status.ok() && error_callback_) {
            error_callback_(status.error_message());
        }
        
        if (completion_callback_) {
            completion_callback_();
        }
    }
    
    // JSON conversion helpers
    static std::string cudaResponseToJson(const CudaResponse& response) {
        // Convert protobuf to JSON string
        std::string json = "{";
        json += "\"session_id\":\"" + response.session_id() + "\",";
        json += "\"operation_type\":\"" + response.operation_type() + "\",";
        json += "\"status\":" + std::to_string(response.status()) + ",";
        
        if (response.computed_embedding_size() > 0) {
            json += "\"embeddings\":[";
            for (int i = 0; i < response.computed_embedding_size(); ++i) {
                if (i > 0) json += ",";
                json += std::to_string(response.computed_embedding(i));
            }
            json += "],";
        }
        
        if (response.has_cuda_metrics()) {
            const auto& metrics = response.cuda_metrics();
            json += "\"performance\":{";
            json += "\"processing_time_us\":" + std::to_string(metrics.total_processing_time_us()) + ",";
            json += "\"gpu_utilization\":" + std::to_string(metrics.gpu_utilization()) + ",";
            json += "\"gpu_model\":\"" + metrics.gpu_model() + "\"";
            json += "}";
        }
        
        json += "}";
        return json;
    }
    
    static std::string documentResponseToJson(const DocumentResponse& response) {
        // Simplified JSON conversion
        return "{\"document_id\":\"" + response.document_id() + "\"}";
    }
    
    static std::string searchResponseToJson(const SearchResponse& response) {
        // Simplified JSON conversion
        return "{\"query_id\":\"" + response.query_id() + "\"}";
    }
    
    static std::string similarityResponseToJson(const SimilarityResponse& response) {
        // Simplified JSON conversion
        return "{\"base_case_id\":\"" + response.base_case_id() + "\"}";
    }
};

} // namespace legal_cuda_streaming

// Emscripten bindings
using namespace emscripten;
using namespace legal_cuda_streaming;

EMSCRIPTEN_BINDINGS(legal_grpc_client) {
    class_<LegalGrpcWebClient>("LegalGrpcWebClient")
        .constructor<const std::string&>()
        .function("setResponseCallback", &LegalGrpcWebClient::setResponseCallback)
        .function("setErrorCallback", &LegalGrpcWebClient::setErrorCallback)
        .function("setCompletionCallback", &LegalGrpcWebClient::setCompletionCallback)
        .function("startBidirectionalStream", &LegalGrpcWebClient::startBidirectionalStream)
        .function("sendEmbeddingRequest", &LegalGrpcWebClient::sendEmbeddingRequest)
        .function("sendSearchRequest", &LegalGrpcWebClient::sendSearchRequest)
        .function("processLegalDocument", &LegalGrpcWebClient::processLegalDocument)
        .function("performSemanticSearch", &LegalGrpcWebClient::performSemanticSearch)
        .function("analyzeCaseSimilarity", &LegalGrpcWebClient::analyzeCaseSimilarity)
        .function("closeStream", &LegalGrpcWebClient::closeStream)
        .function("isConnected", &LegalGrpcWebClient::isConnected);
        
    register_vector<float>("VectorFloat");
    register_vector<std::string>("VectorString");
}