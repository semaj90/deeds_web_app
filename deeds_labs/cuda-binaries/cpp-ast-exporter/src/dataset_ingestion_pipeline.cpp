#include <torch/torch.h>
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <unordered_map>
#include <algorithm>
#include <thread>
#include <future>
#include <memory>
#include <chrono>
#include <random>
#include <numeric>
#include <nlohmann/json.hpp>

// Phase AST: Dataset Ingestion Pipeline (JSON → tokenized → sharded)
class DatasetIngestionPipeline {
private:
    std::string tokenizer_name_;
    int max_seq_length_;
    int vocab_size_;
    bool shuffle_;
    float train_split_;
    std::unordered_map<std::string, std::string> preprocessing_config_;

    // Tokenization and processing
    std::unique_ptr<torch::jit::Module> tokenizer_model_;
    std::vector<std::vector<int64_t>> tokenized_data_;
    std::vector<std::string> raw_texts_;

    // Sharding parameters
    int num_shards_;
    int shard_size_;
    std::string output_format_; // "pt", "bin", "arrow"

    // Performance metrics
    size_t total_samples_processed_ = 0;
    size_t total_tokens_ = 0;
    std::atomic<size_t> total_samples_processed_{0};
    std::atomic<size_t> total_tokens_{0};
    std::chrono::steady_clock::time_point start_time_;

    // Memory pool for reusing vectors
    mutable std::mutex vector_pool_mutex_;
    std::vector<std::unique_ptr<std::vector<int64_t>>> vector_pool_;

public:
    DatasetIngestionPipeline(
        const std::string& tokenizer_name = "gemma3-legal:latest",
        int max_seq_length = 2048,
        int num_shards = 8,
        const std::string& output_format = "pt"
    ) : tokenizer_name_(tokenizer_name),
        max_seq_length_(max_seq_length),
        num_shards_(num_shards),
        output_format_(output_format),
        shuffle_(true),
        train_split_(0.9f) {

        start_time_ = std::chrono::steady_clock::now();
        load_tokenizer();
        std::cout << "Phase AST Dataset Ingestion Pipeline initialized" << std::endl;
    }

        // Pre-allocate vector pool
        vector_pool_.reserve(std::thread::hardware_concurrency() * 2);
        for (size_t i = 0; i < std::thread::hardware_concurrency() * 2; ++i) {
            vector_pool_.emplace_back(std::make_unique<std::vector<int64_t>>());
            vector_pool_.back()->reserve(max_seq_length_);
        }

    // Load tokenizer model
    void load_tokenizer() {
        load_tokenizer();
        std::cout << "Phase AST Dataset Ingestion Pipeline initialized" << std::endl;
    }
    // Load tokenizer model
    void load_tokenizer() {
        try {
            // Load tokenizer from HuggingFace or local path
            std::string tokenizer_path = "tokenizers/" + tokenizer_name_;
            tokenizer_model_ = torch::jit::load(tokenizer_path);
            std::cout << "Loaded tokenizer: " << tokenizer_name_ << std::endl;

            // Get vocabulary size (would be determined from tokenizer config)
            vocab_size_ = 32000; // Placeholder for Gemma-3 vocab size

        } catch (const std::exception& e) {
            std::cerr << "Failed to load tokenizer: " << e.what() << std::endl;
            // Fallback to basic tokenization
            vocab_size_ = 32000;
        }
    }

    // Load JSON dataset
    // Load JSON dataset with streaming for large files
    bool load_json_dataset(const std::string& json_path) {
        try {
            std::ifstream file(json_path);
            if (!file.is_open()) {
                std::cerr << "Failed to open JSON file: " << json_path << std::endl;
                return false;
            }

            // Get file size for progress tracking
            file.seekg(0, std::ios::end);
            size_t file_size = file.tellg();
            file.seekg(0, std::ios::beg);

            nlohmann::json json_data;
            file >> json_data;

            std::cout << "Loading JSON dataset from: " << json_path << std::endl;
            std::cout << "Loading JSON dataset from: " << json_path << " (" << file_size << " bytes)" << std::endl;

            // Process JSON data (assuming array of objects with "text" field)
            // Reserve memory based on estimated size
            if (json_data.is_array()) {
                raw_texts_.reserve(json_data.size());

                for (const auto& item : json_data) {
                    if (item.contains("text") && item["text"].is_string()) {
                        raw_texts_.emplace_back(item["text"].get<std::string>());
                    }
                }
            }

            std::cout << "Loaded " << raw_texts_.size() << " text samples" << std::endl;
            return true;

        } catch (const std::exception& e) {
            std::cerr << "Error loading JSON dataset: " << e.what() << std::endl;
            return false;
        }
    }

    // Get vector from pool
    std::unique_ptr<std::vector<int64_t>> get_vector_from_pool() const {
        std::lock_guard<std::mutex> lock(vector_pool_mutex_);
        if (!vector_pool_.empty()) {
            auto vec = std::move(vector_pool_.back());
            vector_pool_.pop_back();
            vec->clear();
            return vec;
        }
        auto vec = std::make_unique<std::vector<int64_t>>();
        vec->reserve(max_seq_length_);
        return vec;
    }

    // Return vector to pool
    void return_vector_to_pool(std::unique_ptr<std::vector<int64_t>> vec) const {
        std::lock_guard<std::mutex> lock(vector_pool_mutex_);
        if (vector_pool_.size() < std::thread::hardware_concurrency() * 2) {
            vector_pool_.push_back(std::move(vec));
        }
    }

    // Parallel tokenization with preprocessing
    void tokenize_dataset_parallel(int num_threads = 8) {
    void tokenize_dataset_parallel(int num_threads = 0) {
        if (num_threads <= 0) {
            num_threads = std::min(static_cast<int>(std::thread::hardware_concurrency()), 16);
        }

        std::cout << "Tokenizing dataset with " << num_threads << " threads..." << std::endl;

        // Split data into chunks for parallel processing
        size_t chunk_size = raw_texts_.size() / num_threads;
        size_t chunk_size = std::max(size_t(1), raw_texts_.size() / num_threads);
        std::vector<std::future<std::vector<std::vector<int64_t>>>> futures;
        futures.reserve(num_threads);

        for (int i = 0; i < num_threads; ++i) {
            size_t start_idx = i * chunk_size;
            size_t end_idx = (i == num_threads - 1) ? raw_texts_.size() : (i + 1) * chunk_size;

            futures.push_back(std::async(std::launch::async, [this, start_idx, end_idx]() {
            if (start_idx >= raw_texts_.size()) break;
            futures.emplace_back(std::async(std::launch::async, [this, start_idx, end_idx]() {
                return tokenize_chunk(start_idx, end_idx);
            }));
        }

        // Collect results
        // Collect results and reserve memory
        size_t total_expected = raw_texts_.size();
        tokenized_data_.clear();
        tokenized_data_.reserve(total_expected);

        for (auto& future : futures) {
            auto chunk_result = future.get();
            tokenized_data_.insert(tokenized_data_.end(), chunk_result.begin(), chunk_result.end());
            tokenized_data_.insert(tokenized_data_.end(),
                                 std::make_move_iterator(chunk_result.begin()),
                                 std::make_move_iterator(chunk_result.end()));
        }

        std::cout << "Tokenization complete. Total samples: " << tokenized_data_.size() << std::endl;
    }

    // Tokenize a chunk of texts
    std::vector<std::vector<int64_t>> tokenize_chunk(size_t start_idx, size_t end_idx) {
        std::vector<std::vector<int64_t>> chunk_tokens;
        chunk_tokens.reserve(end_idx - start_idx);

        for (size_t i = start_idx; i < end_idx; ++i) {
            if (i >= raw_texts_.size()) break;

            std::string text = raw_texts_[i];
            const std::string& text = raw_texts_[i];

            // Apply preprocessing
            text = preprocess_text(text);
            std::string processed_text = preprocess_text(text);

            // Tokenize
            std::vector<int64_t> tokens = tokenize_text(text);

            auto tokens_ptr = get_vector_from_pool();
            tokenize_text_inplace(processed_text, *tokens_ptr);
            // Truncate or pad to max_seq_length
            if (tokens.size() > max_seq_length_) {
                tokens.resize(max_seq_length_);
            } else if (tokens.size() < max_seq_length_) {
                tokens.insert(tokens.end(), max_seq_length_ - tokens.size(), 0); // Pad with zeros
            if (tokens_ptr->size() > static_cast<size_t>(max_seq_length_)) {
                tokens_ptr->resize(max_seq_length_);
            } else if (tokens_ptr->size() < static_cast<size_t>(max_seq_length_)) {
                tokens_ptr->resize(max_seq_length_, 0); // Pad with zeros
            }

            chunk_tokens.push_back(tokens);
            total_samples_processed_++;
            total_tokens_ += tokens.size();
            chunk_tokens.emplace_back(std::move(*tokens_ptr));
            return_vector_to_pool(std::move(tokens_ptr));

            total_samples_processed_.fetch_add(1, std::memory_order_relaxed);
            total_tokens_.fetch_add(chunk_tokens.back().size(), std::memory_order_relaxed);
        }

        return chunk_tokens;
    }

    // Preprocess text according to configuration
    std::string preprocess_text(const std::string& text) {
    // Preprocess text according to configuration (optimized)
    std::string preprocess_text(const std::string& text) const {
        if (preprocessing_config_.empty()) {
            return text;
        }

        std::string processed = text;

        // Apply preprocessing rules from config
        if (preprocessing_config_.count("lowercase") && preprocessing_config_["lowercase"] == "true") {
            std::transform(processed.begin(), processed.end(), processed.begin(), ::tolower);
        auto lowercase_it = preprocessing_config_.find("lowercase");
        if (lowercase_it != preprocessing_config_.end() && lowercase_it->second == "true") {
            std::transform(processed.begin(), processed.end(), processed.begin(),
                         [](unsigned char c) { return std::tolower(c); });
        }

        if (preprocessing_config_.count("remove_special_chars") && preprocessing_config_["remove_special_chars"] == "true") {
            // Remove special characters (simplified)
            processed.erase(std::remove_if(processed.begin(), processed.end(),
                         [](char c) { return !std::isalnum(c) && !std::isspace(c); }), processed.end());
        auto remove_special_it = preprocessing_config_.find("remove_special_chars");
        if (remove_special_it != preprocessing_config_.end() && remove_special_it->second == "true") {
            // Remove special characters (optimized)
            auto new_end = std::remove_if(processed.begin(), processed.end(),
                         [](unsigned char c) { return !std::isalnum(c) && !std::isspace(c); });
            processed.erase(new_end, processed.end());
        }

        return processed;
    }

    // Tokenize individual text (placeholder implementation)
    std::vector<int64_t> tokenize_text(const std::string& text) {
        std::vector<int64_t> tokens;

    // Tokenize individual text in-place (optimized)
    void tokenize_text_inplace(const std::string& text, std::vector<int64_t>& tokens) const {
        tokens.clear();
        if (tokenizer_model_) {
            // Use actual tokenizer model
            // This would call the tokenizer forward pass
            // tokens = tokenizer_model_->forward(text);
        } else {
            // Fallback: simple character-level tokenization
            for (char c : text) {
            // Fallback: optimized character-level tokenization
            tokens.reserve(text.size());
            for (unsigned char c : text) {
                tokens.push_back(static_cast<int64_t>(c) % vocab_size_);
            }
        }

        return tokens;
    }

    // Shuffle dataset if requested
    // Shuffle dataset if requested (optimized)
    void shuffle_dataset() {
        if (!shuffle_) return;
        if (!shuffle_ || tokenized_data_.empty()) return;

        std::vector<size_t> indices(tokenized_data_.size());
        std::iota(indices.begin(), indices.end(), 0);
        std::shuffle(indices.begin(), indices.end(), std::mt19937{std::random_device{}()});

        std::vector<std::vector<int64_t>> shuffled_data;
        shuffled_data.reserve(tokenized_data_.size());

        for (size_t idx : indices) {
            shuffled_data.push_back(tokenized_data_[idx]);
        }

        tokenized_data_ = std::move(shuffled_data);
        std::random_device rd;
        std::mt19937 gen(rd());
        std::shuffle(tokenized_data_.begin(), tokenized_data_.end(), gen);
        std::cout << "Dataset shuffled" << std::endl;
    }

    // Create train/validation split
    // Create train/validation split (optimized)
    std::pair<std::vector<std::vector<int64_t>>, std::vector<std::vector<int64_t>>>
    create_train_val_split() {

        size_t train_size = static_cast<size_t>(tokenized_data_.size() * train_split_);
        size_t val_size = tokenized_data_.size() - train_size;

        std::vector<std::vector<int64_t>> train_data(
            tokenized_data_.begin(),
            tokenized_data_.begin() + train_size
        );

        std::vector<std::vector<int64_t>> val_data(
            tokenized_data_.begin() + train_size,
            tokenized_data_.end()
        );

        std::cout << "Created train/val split: " << train_size << " train, " << val_size << " val" << std::endl;
        std::vector<std::vector<int64_t>> train_data;
        std::vector<std::vector<int64_t>> val_data;
        train_data.reserve(train_size);
        val_data.reserve(tokenized_data_.size() - train_size);

        // Move elements instead of copying
        auto split_point = tokenized_data_.begin() + train_size;

        train_data.assign(std::make_move_iterator(tokenized_data_.begin()),
                         std::make_move_iterator(split_point));

        val_data.assign(std::make_move_iterator(split_point),
                       std::make_move_iterator(tokenized_data_.end()));
        std::cout << "Created train/val split: " << train_data.size() << " train, " << val_data.size() << " val" << std::endl;

        return {train_data, val_data};
        return {std::move(train_data), std::move(val_data)};
    }

    // Shard and save dataset
    // Shard and save dataset (optimized)
    bool shard_and_save(const std::string& output_dir) {
        std::cout << "Sharding dataset into " << num_shards_ << " shards..." << std::endl;

        shard_size_ = tokenized_data_.size() / num_shards_;

        for (int shard_idx = 0; shard_idx < num_shards_; ++shard_idx) {
            size_t start_idx = shard_idx * shard_size_;
            size_t end_idx = (shard_idx == num_shards_ - 1) ?
                            tokenized_data_.size() : (shard_idx + 1) * shard_size_;

            std::vector<std::vector<int64_t>> shard_data(
                tokenized_data_.begin() + start_idx,
                tokenized_data_.begin() + end_idx
            );

            std::string shard_filename = output_dir + "/shard_" +
                                       std::to_string(shard_idx) + "." + output_format_;

            if (!save_shard(shard_data, shard_filename)) {
                std::cerr << "Failed to save shard " << shard_idx << std::endl;
        if (tokenized_data_.empty()) {
            std::cerr << "No data to shard" << std::endl;
                return false;
            }

            std::cout << "Saved shard " << shard_idx << " with " << shard_data.size() << " samples" << std::endl;
        std::cout << "Sharding dataset into " << num_shards_ << " shards..." << std::endl;

        shard_size_ = tokenized_data_.size() / num_shards_;

        // Parallel shard saving
        std::vector<std::future<bool>> futures;
        futures.reserve(num_shards_);

        for (int shard_idx = 0; shard_idx < num_shards_; ++shard_idx) {
            size_t start_idx = shard_idx * shard_size_;
            size_t end_idx = (shard_idx == num_shards_ - 1) ?
                            tokenized_data_.size() : (shard_idx + 1) * shard_size_;

            std::string shard_filename = output_dir + "/shard_" +
                                       std::to_string(shard_idx) + "." + output_format_;

            futures.emplace_back(std::async(std::launch::async, [this, start_idx, end_idx, shard_filename, shard_idx]() {
                std::vector<std::vector<int64_t>> shard_data;
                shard_data.reserve(end_idx - start_idx);

                // Move data to shard
                for (size_t i = start_idx; i < end_idx; ++i) {
                    shard_data.emplace_back(std::move(tokenized_data_[i]));
        }

        return true;
    }

    // Save individual shard
    bool save_shard(const std::vector<std::vector<int64_t>>& shard_data, const std::string& filename) {
        try {
            if (output_format_ == "pt") {
                // Save as PyTorch tensor
                std::vector<torch::Tensor> tensors;
                for (const auto& seq : shard_data) {
                    tensors.push_back(torch::tensor(seq, torch::kLong));
                }

                auto stacked = torch::stack(tensors);
                torch::save(stacked, filename);

            } else if (output_format_ == "bin") {
                // Save as binary format
                std::ofstream file(filename, std::ios::binary);
                if (!file.is_open()) return false;

                // Write header
                uint32_t num_samples = shard_data.size();
                uint32_t seq_length = max_seq_length_;
                file.write(reinterpret_cast<char*>(&num_samples), sizeof(uint32_t));
                file.write(reinterpret_cast<char*>(&seq_length), sizeof(uint32_t));

                // Write data
                for (const auto& seq : shard_data) {
                    file.write(reinterpret_cast<const char*>(seq.data()), seq.size() * sizeof(int64_t));
                }

            } else {
                std::cerr << "Unsupported output format: " << output_format_ << std::endl;
                return false;
            }

            return true;

        } catch (const std::exception& e) {
            std::cerr << "Error saving shard: " << e.what() << std::endl;
            return false;
        }
    }

    // Get dataset statistics
    std::unordered_map<std::string, size_t> get_statistics() {
        size_t total_sequences = tokenized_data_.size();
        size_t total_tokens = 0;
        size_t max_length = 0;
        size_t min_length = SIZE_MAX;
        size_t avg_length = 0;

        for (const auto& seq : tokenized_data_) {
            size_t seq_len = seq.size();
            total_tokens += seq_len;
            max_length = std::max(max_length, seq_len);
            min_length = std::min(min_length, seq_len);
        }

        if (total_sequences > 0) {
            avg_length = total_tokens / total_sequences;
        }

        return {
            {"total_samples", total_sequences},
            {"total_tokens", total_tokens},
            {"avg_seq_length", avg_length},
            {"max_seq_length", max_length},
            {"min_seq_length", min_length},
            {"vocab_size", static_cast<size_t>(vocab_size_)}
        };
    }

    // Get processing metrics
    std::unordered_map<std::string, double> get_processing_metrics() {
        auto elapsed = std::chrono::steady_clock::now() - start_time_;
        double elapsed_seconds = std::chrono::duration<double>(elapsed).count();

        return {
            {"processing_time_seconds", elapsed_seconds},
            {"samples_per_second", total_samples_processed_ / elapsed_seconds},
            {"tokens_per_second", total_tokens_ / elapsed_seconds}
        };
    }

    // Full pipeline execution
    bool process_dataset(const std::string& input_json, const std::string& output_dir) {
        std::cout << "=== Phase AST Dataset Ingestion Pipeline ===" << std::endl;

        // Step 1: Load JSON dataset
        if (!load_json_dataset(input_json)) {
            return false;
        }

        // Step 2: Parallel tokenization
        tokenize_dataset_parallel();

        // Step 3: Shuffle if requested
        shuffle_dataset();

        // Step 4: Create train/val split
        auto [train_data, val_data] = create_train_val_split();

        // Step 5: Shard and save training data
        tokenized_data_ = std::move(train_data);
        if (!shard_and_save(output_dir + "/train")) {
            return false;
        }

        // Step 6: Shard and save validation data
        tokenized_data_ = std::move(val_data);
        if (!shard_and_save(output_dir + "/val")) {
            return false;
        }

        // Print statistics
        auto stats = get_statistics();
        auto metrics = get_processing_metrics();

        std::cout << "\n=== Processing Complete ===" << std::endl;
        std::cout << "Total samples: " << stats["total_samples"] << std::endl;
        std::cout << "Total tokens: " << stats["total_tokens"] << std::endl;
        std::cout << "Avg sequence length: " << stats["avg_seq_length"] << std::endl;
        std::cout << "Processing time: " << metrics["processing_time_seconds"] << "s" << std::endl;
        std::cout << "Samples/sec: " << metrics["samples_per_second"] << std::endl;
        std::cout << "Tokens/sec: " << metrics["tokens_per_second"] << std::endl;

        return true;
    }
};

// gRPC service implementation for dataset ingestion
class DatasetIngestionService final : public legal_ai::qlora::QLoRATrainer::Service {
public:
    grpc::Status ProcessDataset(
        grpc::ServerContext* context,
        const legal_ai::qlora::DatasetIngestionRequest* request,
        legal_ai::qlora::DatasetIngestionResponse* response) override {

        try {
            DatasetIngestionPipeline pipeline(
                request->config().tokenizer_name(),
                request->config().max_seq_length(),
                8, // num_shards
                "pt" // output_format
            );

            bool success = pipeline.process_dataset(
                request->dataset_path(),
                request->output_path()
            );

                bool success = save_shard(shard_data, shard_filename);
            if (success) {
                response->set_success(true);
                response->set_message("Dataset processing completed successfully");

                // Fill response with statistics
                auto stats = pipeline.get_statistics();
                auto* response_stats = response->mutable_stats();
                response_stats->set_total_samples(stats["total_samples"]);
                response_stats->set_avg_seq_length(stats["avg_seq_length"]);
                response_stats->set_max_seq_length(stats["max_seq_length"]);
                response_stats->set_vocab_size(stats["vocab_size"]);

                // Add token counts (simplified)
                (*response_stats->mutable_token_counts())["total"] = stats["total_tokens"];

                    std::cout << "Saved shard " << shard_idx << " with " << shard_data.size() << " samples" << std::endl;
                }
                return success;
            }));
        }

        // Wait for all shards to complete
        bool all_success = true;
        for (auto& future : futures) {
            if (!future.get()) {
                all_success = false;
            }
        }

        return all_success;
    }

    // Save individual shard (optimized)
    bool save_shard(const std::vector<std::vector<int64_t>>& shard_data, const std::string& filename) const {
        try {
            if (output_format_ == "pt") {
                // Save as PyTorch tensor (optimized)
                if (shard_data.empty()) return true;

                // Pre-allocate tensor
                auto options = torch::TensorOptions().dtype(torch::kLong);
                auto tensor = torch::zeros({static_cast<int64_t>(shard_data.size()),
                                          static_cast<int64_t>(max_seq_length_)}, options);

                // Fill tensor efficiently
                auto accessor = tensor.accessor<int64_t, 2>();
                for (size_t i = 0; i < shard_data.size(); ++i) {
                    const auto& seq = shard_data[i];
                    for (size_t j = 0; j < seq.size() && j < static_cast<size_t>(max_seq_length_); ++j) {
                        accessor[i][j] = seq[j];
                    }
                }

                torch::save(tensor, filename);

            } else if (output_format_ == "bin") {
                // Save as binary format (optimized)
                std::ofstream file(filename, std::ios::binary);
                if (!file.is_open()) return false;

                // Write header
                uint32_t num_samples = static_cast<uint32_t>(shard_data.size());
                uint32_t seq_length = static_cast<uint32_t>(max_seq_length_);
                file.write(reinterpret_cast<const char*>(&num_samples), sizeof(uint32_t));
                file.write(reinterpret_cast<const char*>(&seq_length), sizeof(uint32_t));

                // Write data in batches for better I/O performance
                constexpr size_t batch_size = 1024;
                std::vector<int64_t> buffer;
                buffer.reserve(batch_size * max_seq_length_);

                for (size_t i = 0; i < shard_data.size(); i += batch_size) {
                    buffer.clear();
                    size_t end_idx = std::min(i + batch_size, shard_data.size());

                    for (size_t j = i; j < end_idx; ++j) {
                        const auto& seq = shard_data[j];
                        buffer.insert(buffer.end(), seq.begin(), seq.end());
                    }

                    file.write(reinterpret_cast<const char*>(buffer.data()),
                              buffer.size() * sizeof(int64_t));
                }
            } else {
                response->set_success(false);
                response->set_message("Dataset processing failed");
                std::cerr << "Unsupported output format: " << output_format_ << std::endl;
                return false;
            }

            return true;

        } catch (const std::exception& e) {
            response->set_success(false);
            response->set_message(std::string("Error: ") + e.what());
            std::cerr << "Error saving shard: " << e.what() << std::endl;
            return false;
        }

        return grpc::Status::OK;
    }

    // Get dataset statistics (optimized)
    std::unordered_map<std::string, size_t> get_statistics() const {
        if (tokenized_data_.empty()) {
            return {
                {"total_samples", 0},
                {"total_tokens", 0},
                {"avg_seq_length", 0},
                {"max_seq_length", 0},
                {"min_seq_length", 0},
                {"vocab_size", static_cast<size_t>(vocab_size_)}
};
        }

// Main function for dataset ingestion service
int main(int argc, char* argv[]) {
    if (argc < 3) {
        std::cerr << "Usage: " << argv[0] << " <input_json> <output_dir>" << std::endl;
        std::cerr << "Or run as gRPC service: " << argv[0] << " --grpc <port>" << std::endl;
        return 1;
        size_t total_sequences = tokenized_data_.size();
        size_t total_tokens = 0;
        size_t max_length = 0;
        size_t min_length = SIZE_MAX;

        // Parallel computation of statistics
        const size_t num_threads = std::min(static_cast<size_t>(std::thread::hardware_concurrency()), total_sequences);
        const size_t chunk_size = total_sequences / num_threads;

        std::vector<std::future<std::tuple<size_t, size_t, size_t>>> futures;

        for (size_t i = 0; i < num_threads; ++i) {
            size_t start = i * chunk_size;
            size_t end = (i == num_threads - 1) ? total_sequences : (i + 1) * chunk_size;

            futures.emplace_back(std::async(std::launch::async, [this, start, end]() {
                size_t chunk_tokens = 0;
                size_t chunk_max = 0;
                size_t chunk_min = SIZE_MAX;

                for (size_t j = start; j < end; ++j) {
                    size_t seq_len = tokenized_data_[j].size();
                    chunk_tokens += seq_len;
                    chunk_max = std::max(chunk_max, seq_len);
                    chunk_min = std::min(chunk_min, seq_len);
                }

                return std::make_tuple(chunk_tokens, chunk_max, chunk_min);
            }));
        }

        for (auto& future : futures) {
            auto [chunk_tokens, chunk_max, chunk_min] = future.get();
            total_tokens += chunk_tokens;
            max_length = std::max(max_length, chunk_max);
            min_length = std::min(min_length, chunk_min);
        }

        size_t avg_length = total_tokens / total_sequences;
        return {
            {"total_samples", total_sequences},
            {"total_tokens", total_tokens},
            {"avg_seq_length", avg_length},
            {"max_seq_length", max_length},
            {"min_seq_length", min_length},
            {"vocab_size", static_cast<size_t>(vocab_size_)}
        };
    }

    std::string mode = argv[1];

    if (mode == "--grpc") {
        // Run as gRPC service
        int port = std::stoi(argv[2]);

        std::string server_address = "0.0.0.0:" + std::to_string(port);
        DatasetIngestionService service;

        grpc::ServerBuilder builder;
        builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
        builder.RegisterService(&service);

        std::unique_ptr<grpc::Server> server(builder.BuildAndStart());
        std::cout << "Phase AST Dataset Ingestion gRPC service listening on " << server_address << std::endl;

        server->Wait();

    // Get processing metrics
    std::unordered_map<std::string, double> get_processing_metrics() const {
        auto elapsed = std::chrono::steady_clock::now() - start_time_;
        double elapsed_seconds = std::chrono::duration<double>(elapsed).count();

        size_t samples = total_samples_processed_.load(std::memory_order_relaxed);
        size_t tokens = total_tokens_.load(std::memory_order_relaxed);

        return {
            {"processing_time_seconds", elapsed_seconds},
            {"samples_per_second", elapsed_seconds > 0 ? samples / elapsed_seconds : 0.0},
            {"tokens_per_second", elapsed_seconds > 0 ? tokens / elapsed_seconds : 0.0}
        };
    }

    // Full pipeline execution (optimized)
    bool process_dataset(const std::string& input_json, const std::string& output_dir) {
        std::cout << "=== Phase AST Dataset Ingestion Pipeline ===" << std::endl;

        // Step 1: Load JSON dataset
        if (!load_json_dataset(input_json)) {
            return false;
        }

        // Step 2: Parallel tokenization
        tokenize_dataset_parallel();

        // Step 3: Shuffle if requested
        shuffle_dataset();

        // Step 4: Create train/val split
        auto [train_data, val_data] = create_train_val_split();

        // Step 5: Shard and save training data
        tokenized_data_ = std::move(train_data);
        if (!shard_and_save(output_dir + "/train")) {
            return false;
        }

        // Step 6: Shard and save validation data
        tokenized_data_ = std::move(val_data);
        if (!shard_and_save(output_dir + "/val")) {
            return false;
        }

        // Print statistics
        auto stats = get_statistics();
        auto metrics = get_processing_metrics();

        std::cout << "\n=== Processing Complete ===" << std::endl;
        std::cout << "Total samples: " << stats["total_samples"] << std::endl;
        std::cout << "Total tokens: " << stats["total_tokens"] << std::endl;
        std::cout << "Avg sequence length: " << stats["avg_seq_length"] << std::endl;
        std::cout << "Processing time: " << metrics["processing_time_seconds"] << "s" << std::endl;
        std::cout << "Samples/sec: " << metrics["samples_per_second"] << std::endl;
        std::cout << "Tokens/sec: " << metrics["tokens_per_second"] << std::endl;

        return true;
    }
};

// Main function for dataset ingestion service
int main(int argc, char* argv[]) {
    if (argc < 3) {
        std::cerr << "Usage: " << argv[0] << " <input_json> <output_dir>" << std::endl;
        return 1;
    }

    std::string input_json = argv[1];
    std::string output_dir = argv[2];

    DatasetIngestionPipeline pipeline;
    bool success = pipeline.process_dataset(input_json, output_dir);

    return success ? 0 : 1;
}