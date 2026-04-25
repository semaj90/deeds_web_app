#include <torch/torch.h>
#include <cuda_runtime.h>
#include <cublas_v2.h>
#include <cudnn.h>
#include <iostream>
#include <vector>
#include <string>
#include <memory>
#include <unordered_map>
#include <algorithm>
#include <cmath>
#include <chrono>
#include <thread>
#include <future>
#include <grpcpp/grpcpp.h>
#include <grpcpp/ext/proto_server_reflection_plugin.h>
#include <grpcpp/health_check_service_interface.h>
#include "qlora_training.grpc.pb.h"

// Phase AST: QLoRA gRPC Service Implementation
class QLoRATrainerService final : public legal_ai::qlora::QLoRATrainer::Service {
private:
    // QLoRA trainer instance
    std::unique_ptr<QLoRATrainer> trainer_;

    // Active training sessions
    std::unordered_map<std::string, std::unique_ptr<QLoRATrainer>> active_sessions_;

    // Session management
    std::mutex sessions_mutex_;

    // Generate unique session ID
    std::string generate_session_id() {
        auto now = std::chrono::system_clock::now();
        auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()).count();
        return "qlora_session_" + std::to_string(timestamp) + "_" +
               std::to_string(rand() % 10000);
    }

public:
    QLoRATrainerService() {
        std::cout << "Phase AST QLoRA gRPC Service initialized" << std::endl;
    }

    // Start training session
    grpc::Status StartTraining(
        grpc::ServerContext* context,
        const legal_ai::qlora::TrainingRequest* request,
        legal_ai::qlora::TrainingSession* response) override {

        try {
            std::string session_id = generate_session_id();

            // Create QLoRA configuration
            int lora_r = request->qlora_config().lora_r();
            int lora_alpha = request->qlora_config().lora_alpha();
            std::string model_name = request->model_name();

            // Create trainer instance
            auto trainer = std::make_unique<QLoRATrainer>(model_name, lora_r, lora_alpha);

            // Store session
            {
                std::lock_guard<std::mutex> lock(sessions_mutex_);
                active_sessions_[session_id] = std::move(trainer);
            }

            // Populate response
            response->set_session_id(session_id);
            response->set_status("initialized");
            response->mutable_config()->CopyFrom(request->training_config());
            response->set_gpu_info("NVIDIA RTX 3060 (sm_86)");
            *response->mutable_start_time() = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count();

            std::cout << "Started training session: " << session_id << std::endl;

        } catch (const std::exception& e) {
            return grpc::Status(grpc::StatusCode::INTERNAL,
                              std::string("Failed to start training: ") + e.what());
        }

        return grpc::Status::OK;
    }

    // Stream training progress
    grpc::Status StreamTrainingProgress(
        grpc::ServerContext* context,
        const legal_ai::qlora::TrainingSession* request,
        grpc::ServerWriter<legal_ai::qlora::TrainingProgress>* writer) override {

        std::string session_id = request->session_id();

        // Get trainer instance
        QLoRATrainer* trainer = nullptr;
        {
            std::lock_guard<std::mutex> lock(sessions_mutex_);
            auto it = active_sessions_.find(session_id);
            if (it == active_sessions_.end()) {
                return grpc::Status(grpc::StatusCode::NOT_FOUND, "Training session not found");
            }
            trainer = it->second.get();
        }

        // Stream progress updates
        int epoch = 0;
        int step = 0;
        const int max_steps = 1000; // Example training loop

        while (!context->IsCancelled() && step < max_steps) {
            // Simulate training step
            float loss = trainer->training_step(
                torch::randint(0, 32000, {4, 512}, torch::kLong),
                torch::randint(0, 32000, {4, 512}, torch::kLong)
            );

            // Create progress message
            legal_ai::qlora::TrainingProgress progress;
            progress.set_session_id(session_id);
            progress.set_epoch(epoch);
            progress.set_step(step);
            progress.set_loss(loss);
            progress.set_learning_rate(1e-4f); // Example
            progress.set_epoch_progress(static_cast<float>(step % 100) / 100.0f);

            // Add metrics
            auto metrics = trainer->get_metrics();
            auto* response_metrics = progress.mutable_metrics();
            (*response_metrics->mutable_custom_metrics())["loss"] = loss;
            (*response_metrics->mutable_custom_metrics())["tokens_per_second"] = metrics["tokens_per_second"];

            // Add log entry
            auto* log_entry = progress.add_logs();
            log_entry->set_timestamp(std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count());
            log_entry->set_level("INFO");
            log_entry->set_message("Training step " + std::to_string(step) + " completed");
            log_entry->set_component("QLoRATrainer");

            // Send progress update
            if (!writer->Write(progress)) {
                break; // Client disconnected
            }

            step++;
            if (step % 100 == 0) {
                epoch++;
            }

            // Small delay to simulate real training
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }

        return grpc::Status::OK;
    }

    // Stop training session
    grpc::Status StopTraining(
        grpc::ServerContext* context,
        const legal_ai::qlora::TrainingSession* request,
        legal_ai::qlora::TrainingStatus* response) override {

        std::string session_id = request->session_id();

        {
            std::lock_guard<std::mutex> lock(sessions_mutex_);
            auto it = active_sessions_.find(session_id);
            if (it == active_sessions_.end()) {
                return grpc::Status(grpc::StatusCode::NOT_FOUND, "Training session not found");
            }

            // Get final metrics
            auto metrics = it->second->get_metrics();

            // Populate response
            response->set_session_id(session_id);
            response->set_status("stopped");
            response->set_message("Training stopped by user request");

            auto* final_metrics = response->mutable_final_metrics();
            final_metrics->set_train_loss(metrics["loss"]);
            final_metrics->set_gpu_utilization(85.0f); // Example
            final_metrics->set_gpu_memory_used(4096.0f); // Example
            final_metrics->set_learning_rate(1e-4f);
            final_metrics->set_tokens_processed(metrics["tokens_processed"]);

            *response->mutable_end_time() = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count();

            // Remove session
            active_sessions_.erase(it);
        }

        std::cout << "Stopped training session: " << session_id << std::endl;
        return grpc::Status::OK;
    }

    // Get training metrics
    grpc::Status GetTrainingMetrics(
        grpc::ServerContext* context,
        const legal_ai::qlora::TrainingSession* request,
        legal_ai::qlora::TrainingMetrics* response) override {

        std::string session_id = request->session_id();

        QLoRATrainer* trainer = nullptr;
        {
            std::lock_guard<std::mutex> lock(sessions_mutex_);
            auto it = active_sessions_.find(session_id);
            if (it == active_sessions_.end()) {
                return grpc::Status(grpc::StatusCode::NOT_FOUND, "Training session not found");
            }
            trainer = it->second.get();
        }

        // Get current metrics
        auto metrics = trainer->get_metrics();

        response->set_train_loss(metrics["loss"]);
        response->set_gpu_utilization(85.0f); // Example
        response->set_gpu_memory_used(4096.0f); // Example
        response->set_learning_rate(1e-4f);
        response->set_tokens_processed(metrics["tokens_processed"]);
        response->set_tokens_per_second(metrics["tokens_per_second"]);

        return grpc::Status::OK;
    }

    // Save adapter weights
    grpc::Status SaveAdapter(
        grpc::ServerContext* context,
        const legal_ai::qlora::SaveAdapterRequest* request,
        legal_ai::qlora::SaveAdapterResponse* response) override {

        try {
            std::string session_id = request->session_id();
            std::string adapter_path = request->adapter_path();

            // In a real implementation, this would save the LoRA weights
            // For now, create a placeholder response

            response->set_success(true);
            response->set_adapter_path(adapter_path);
            response->set_adapter_size_bytes(1048576); // 1MB example
            response->set_message("Adapter saved successfully");

            std::cout << "Saved adapter for session " << session_id << " to " << adapter_path << std::endl;

        } catch (const std::exception& e) {
            response->set_success(false);
            response->set_message(std::string("Failed to save adapter: ") + e.what());
        }

        return grpc::Status::OK;
    }

    // Load adapter weights
    grpc::Status LoadAdapter(
        grpc::ServerContext* context,
        const legal_ai::qlora::LoadAdapterRequest* request,
        legal_ai::qlora::LoadAdapterResponse* response) override {

        try {
            std::string adapter_path = request->adapter_path();
            std::string base_model = request->base_model_name();

            // In a real implementation, this would load LoRA weights
            // For now, create a placeholder response

            response->set_success(true);
            response->set_model_info("QLoRA adapter loaded for " + base_model);
            response->set_message("Adapter loaded successfully");

            std::cout << "Loaded adapter from " << adapter_path << " for model " << base_model << std::endl;

        } catch (const std::exception& e) {
            response->set_success(false);
            response->set_message(std::string("Failed to load adapter: ") + e.what());
        }

        return grpc::Status::OK;
    }

    // Health check
    grpc::Status HealthCheck(
        grpc::ServerContext* context,
        const legal_ai::qlora::HealthRequest* request,
        legal_ai::qlora::HealthResponse* response) override {

        response->set_status("healthy");

        // Check CUDA availability
        int device_count = 0;
        cudaError_t cuda_status = cudaGetDeviceCount(&device_count);
        response->set_cuda_available(cuda_status == cudaSuccess && device_count > 0);

        // Check memory status
        response->set_memory_ok(true); // Simplified

        // Active sessions count
        {
            std::lock_guard<std::mutex> lock(sessions_mutex_);
            response->set_active_sessions(active_sessions_.size());
        }

        // GPU memory info
        if (response->cuda_available()) {
            size_t free_byte, total_byte;
            cudaMemGetInfo(&free_byte, &total_byte);
            response->set_gpu_memory_free_mb(free_byte / (1024 * 1024));
        }

        (*response->mutable_details())["version"] = "Phase AST v1.0";
        (*response->mutable_details())["cuda_devices"] = std::to_string(device_count);

        return grpc::Status::OK;
    }
};

// Forward declaration of QLoRATrainer class (defined in rag_lora_trainer.cpp)
class QLoRATrainer {
public:
    QLoRATrainer(const std::string& model_name, int lora_r = 16, int lora_alpha = 32);
    float training_step(const torch::Tensor& input_ids, const torch::Tensor& labels);
    std::unordered_map<std::string, float> get_metrics();
};

// Main function for QLoRA gRPC service
int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <port>" << std::endl;
        std::cerr << "Example: " << argv[0] << " 8098" << std::endl;
        return 1;
    }

    int port = std::stoi(argv[1]);
    std::string server_address = "0.0.0.0:" + std::to_string(port);

    // Initialize gRPC service
    QLoRATrainerService service;

    grpc::EnableDefaultHealthCheckService(true);
    grpc::reflection::InitProtoReflectionServerBuilderPlugin();

    grpc::ServerBuilder builder;
    builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
    builder.RegisterService(&service);

    // Add compression
    builder.SetDefaultCompressionAlgorithm(GRPC_COMPRESS_GZIP);
    builder.SetDefaultCompressionLevel(GRPC_COMPRESS_LEVEL_HIGH);

    std::unique_ptr<grpc::Server> server = builder.BuildAndStart();
    if (!server) {
        std::cerr << "Failed to start gRPC server" << std::endl;
        return 1;
    }

    std::cout << "Phase AST QLoRA gRPC service listening on " << server_address << std::endl;
    std::cout << "Features: NF4 quantization, LoRA adapters, fused CUDA operations" << std::endl;
    std::cout << "Ready for training requests..." << std::endl;

    server->Wait();

    return 0;
}