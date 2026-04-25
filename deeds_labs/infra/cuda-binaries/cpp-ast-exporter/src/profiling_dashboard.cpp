#include <torch/torch.h>
#include <cuda_runtime.h>
#include <nvml.h>
#include <iostream>
#include <iomanip>
#include <thread>
#include <chrono>
#include <atomic>
#include <vector>
#include <string>
#include <unordered_map>
#include <memory>

// Phase SIMDJSON: GPU Profiling Dashboard
// Real-time monitoring of GPU performance, memory, and utilization

class GPUProfiler {
private:
    nvmlDevice_t device_;
    std::atomic<bool> running_;
    std::thread monitor_thread_;

    // Performance metrics
    struct GPUMetrics {
        unsigned int temperature;
        unsigned int power_usage;
        unsigned int power_limit;
        unsigned int memory_used;
        unsigned int memory_total;
        unsigned int gpu_utilization;
        unsigned int memory_utilization;
        float memory_bandwidth;
        unsigned int fan_speed;
    };

    GPUMetrics current_metrics_;
    std::vector<GPUMetrics> metrics_history_;

    // Profiling data
    std::unordered_map<std::string, std::vector<float>> operation_timings_;
    std::unordered_map<std::string, size_t> memory_allocations_;

public:
    GPUProfiler() : running_(false) {
        // Initialize NVML
        nvmlInit();
        nvmlDeviceGetHandleByIndex(0, &device_);

        std::cout << "GPU Profiling Dashboard initialized" << std::endl;
    }

    ~GPUProfiler() {
        stop_monitoring();
        nvmlShutdown();
    }

    // Start real-time monitoring
    void start_monitoring(int interval_ms = 1000) {
        if (running_) return;

        running_ = true;
        monitor_thread_ = std::thread([this, interval_ms]() {
            while (running_) {
                update_metrics();
                std::this_thread::sleep_for(std::chrono::milliseconds(interval_ms));
            }
        });

        std::cout << "GPU monitoring started (interval: " << interval_ms << "ms)" << std::endl;
    }

    // Stop monitoring
    void stop_monitoring() {
        if (!running_) return;

        running_ = false;
        if (monitor_thread_.joinable()) {
            monitor_thread_.join();
        }

        std::cout << "GPU monitoring stopped" << std::endl;
    }

    // Update current metrics
    void update_metrics() {
        nvmlUtilization_t utilization;
        nvmlMemory_t memory;
        unsigned int temperature, power_usage, power_limit, fan_speed;

        // Get GPU utilization
        nvmlDeviceGetUtilizationRates(device_, &utilization);

        // Get memory info
        nvmlDeviceGetMemoryInfo(device_, &memory);

        // Get temperature
        nvmlDeviceGetTemperature(device_, NVML_TEMPERATURE_GPU, &temperature);

        // Get power usage
        nvmlDeviceGetPowerUsage(device_, &power_usage);
        nvmlDeviceGetPowerManagementLimit(device_, &power_limit);

        // Get fan speed
        nvmlDeviceGetFanSpeed(device_, &fan_speed);

        // Update current metrics
        current_metrics_ = {
            temperature,
            power_usage / 1000,  // Convert to watts
            power_limit / 1000,
            static_cast<unsigned int>(memory.used / (1024 * 1024)),  // MB
            static_cast<unsigned int>(memory.total / (1024 * 1024)),
            utilization.gpu,
            utilization.memory,
            0.0f,  // Memory bandwidth (would need additional calculation)
            fan_speed
        };

        // Store in history (keep last 100 samples)
        metrics_history_.push_back(current_metrics_);
        if (metrics_history_.size() > 100) {
            metrics_history_.erase(metrics_history_.begin());
        }
    }

    // Display real-time dashboard
    void display_dashboard() {
        std::cout << "\033[2J\033[H";  // Clear screen and move cursor to top
        std::cout << "=== GPU Profiling Dashboard ===\n\n";

        std::cout << std::left << std::setw(25) << "Metric" << std::setw(15) << "Value" << "Unit\n";
        std::cout << std::string(50, '-') << "\n";

        std::cout << std::left << std::setw(25) << "GPU Temperature" << std::setw(15)
                  << current_metrics_.temperature << "°C\n";
        std::cout << std::left << std::setw(25) << "Power Usage" << std::setw(15)
                  << current_metrics_.power_usage << "W\n";
        std::cout << std::left << std::setw(25) << "Power Limit" << std::setw(15)
                  << current_metrics_.power_limit << "W\n";
        std::cout << std::left << std::setw(25) << "GPU Utilization" << std::setw(15)
                  << current_metrics_.gpu_utilization << "%\n";
        std::cout << std::left << std::setw(25) << "Memory Utilization" << std::setw(15)
                  << current_metrics_.memory_utilization << "%\n";
        std::cout << std::left << std::setw(25) << "Memory Used" << std::setw(15)
                  << current_metrics_.memory_used << "MB\n";
        std::cout << std::left << std::setw(25) << "Memory Total" << std::setw(15)
                  << current_metrics_.memory_total << "MB\n";
        std::cout << std::left << std::setw(25) << "Fan Speed" << std::setw(15)
                  << current_metrics_.fan_speed << "%\n";

        std::cout << "\n=== Performance History ===\n";
        if (!metrics_history_.empty()) {
            std::cout << "Samples: " << metrics_history_.size() << "\n";
            std::cout << "Avg GPU Util: " << calculate_average_gpu_util() << "%\n";
            std::cout << "Peak Memory: " << calculate_peak_memory() << "MB\n";
            std::cout << "Avg Power: " << calculate_average_power() << "W\n";
        }

        std::cout << "\n=== Memory Allocations ===\n";
        for (const auto& alloc : memory_allocations_) {
            std::cout << alloc.first << ": " << alloc.second << " bytes\n";
        }
    }

    // Profile a specific operation
    template<typename Func>
    float profile_operation(const std::string& name, Func&& operation, int iterations = 1) {
        cudaEvent_t start, stop;
        cudaEventCreate(&start);
        cudaEventCreate(&stop);

        cudaEventRecord(start);

        for (int i = 0; i < iterations; ++i) {
            operation();
        }

        cudaEventRecord(stop);
        cudaEventSynchronize(stop);

        float milliseconds = 0;
        cudaEventElapsedTime(&milliseconds, start, stop);

        float avg_time = milliseconds / iterations;
        operation_timings_[name].push_back(avg_time);

        cudaEventDestroy(start);
        cudaEventDestroy(stop);

        return avg_time;
    }

    // Track memory allocation
    void track_allocation(const std::string& name, size_t size) {
        memory_allocations_[name] = size;
    }

    // Get current metrics
    const GPUMetrics& get_current_metrics() const {
        return current_metrics_;
    }

    // Export metrics to JSON-like format
    std::string export_metrics() {
        std::stringstream ss;
        ss << "{\n";
        ss << "  \"temperature\": " << current_metrics_.temperature << ",\n";
        ss << "  \"power_usage\": " << current_metrics_.power_usage << ",\n";
        ss << "  \"gpu_utilization\": " << current_metrics_.gpu_utilization << ",\n";
        ss << "  \"memory_used\": " << current_metrics_.memory_used << ",\n";
        ss << "  \"memory_total\": " << current_metrics_.memory_total << ",\n";
        ss << "  \"operation_timings\": {\n";

        for (auto it = operation_timings_.begin(); it != operation_timings_.end(); ++it) {
            ss << "    \"" << it->first << "\": [";
            for (size_t i = 0; i < it->second.size(); ++i) {
                ss << it->second[i];
                if (i < it->second.size() - 1) ss << ", ";
            }
            ss << "]";
            if (std::next(it) != operation_timings_.end()) ss << ",";
            ss << "\n";
        }

        ss << "  }\n";
        ss << "}\n";

        return ss.str();
    }

private:
    float calculate_average_gpu_util() {
        if (metrics_history_.empty()) return 0.0f;

        float sum = 0.0f;
        for (const auto& metric : metrics_history_) {
            sum += metric.gpu_utilization;
        }
        return sum / metrics_history_.size();
    }

    unsigned int calculate_peak_memory() {
        if (metrics_history_.empty()) return 0;

        unsigned int peak = 0;
        for (const auto& metric : metrics_history_) {
            peak = std::max(peak, metric.memory_used);
        }
        return peak;
    }

    float calculate_average_power() {
        if (metrics_history_.empty()) return 0.0f;

        float sum = 0.0f;
        for (const auto& metric : metrics_history_) {
            sum += metric.power_usage;
        }
        return sum / metrics_history_.size();
    }
};

// Main dashboard application
int main(int argc, char* argv[]) {
    try {
        auto profiler = std::make_unique<GPUProfiler>();

        // Start monitoring
        profiler->start_monitoring(500);  // Update every 500ms

        std::cout << "GPU Profiling Dashboard - Press Ctrl+C to exit\n";
        std::cout << "Real-time GPU monitoring active...\n\n";

        // Main display loop
        while (true) {
            profiler->display_dashboard();

            // Profile some example operations
            auto mat_a = torch::randn({1024, 1024}, torch::device(torch::kCUDA));
            auto mat_b = torch::randn({1024, 1024}, torch::device(torch::kCUDA));

            float matmul_time = profiler->profile_operation("matrix_multiplication", [&]() {
                auto result = torch::mm(mat_a, mat_b);
            }, 10);

            std::cout << "\nLast MatMul Time: " << matmul_time << "ms (avg over 10 runs)\n";

            std::this_thread::sleep_for(std::chrono::seconds(2));
        }

    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}