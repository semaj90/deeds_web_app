#pragma once

#include <string>
#include <vector>
#include <chrono>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <mutex>
#include <iostream>

namespace ErrorLogger {

enum class Severity {
    INFO,
    WARNING,
    ERROR,
    CRITICAL
};

struct CompileError {
    std::string file;
    int line;
    int column;
    std::string message;
    std::string code;
    Severity severity;
    std::string timestamp;
    std::string category; // "CUDA", "LibTorch", "AVX2", "General"
};

class Logger {
private:
    std::vector<CompileError> errors_;
    std::mutex mutex_;
    std::string log_file_;
    bool json_output_;

    std::string getCurrentTimestamp() {
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        std::stringstream ss;
        ss << std::put_time(std::localtime(&time), "%Y-%m-%d %H:%M:%S");
        return ss.str();
    }

    std::string severityToString(Severity sev) {
        switch(sev) {
            case Severity::INFO: return "info";
            case Severity::WARNING: return "warning";
            case Severity::ERROR: return "error";
            case Severity::CRITICAL: return "critical";
            default: return "unknown";
        }
    }

public:
    Logger(const std::string& log_file = "cpp-errors.log", bool json = false)
        : log_file_(log_file), json_output_(json) {}

    void log(const CompileError& error) {
        std::lock_guard<std::mutex> lock(mutex_);
        errors_.push_back(error);

        // Write to file immediately
        std::ofstream file(log_file_, std::ios::app);
        if (file.is_open()) {
            if (json_output_) {
                file << errorToJson(error) << std::endl;
            } else {
                file << errorToText(error) << std::endl;
            }
        }

        // Also print to stderr (like svelte-check)
        std::cerr << errorToText(error) << std::endl;
    }

    void logInfo(const std::string& message, const std::string& category = "General") {
        CompileError error{
            "", 0, 0, message, "", Severity::INFO, getCurrentTimestamp(), category
        };
        log(error);
    }

    void logWarning(const std::string& file, int line, const std::string& message,
                    const std::string& category = "General") {
        CompileError error{
            file, line, 0, message, "", Severity::WARNING, getCurrentTimestamp(), category
        };
        log(error);
    }

    void logError(const std::string& file, int line, int column,
                  const std::string& message, const std::string& code = "",
                  const std::string& category = "General") {
        CompileError error{
            file, line, column, message, code, Severity::ERROR, getCurrentTimestamp(), category
        };
        log(error);
    }

    void logCritical(const std::string& message, const std::string& category = "General") {
        CompileError error{
            "", 0, 0, message, "", Severity::CRITICAL, getCurrentTimestamp(), category
        };
        log(error);
    }

    std::string errorToJson(const CompileError& error) {
        std::stringstream ss;
        ss << "{"
           << "\"file\":\"" << escapeJson(error.file) << "\","
           << "\"line\":" << error.line << ","
           << "\"column\":" << error.column << ","
           << "\"message\":\"" << escapeJson(error.message) << "\","
           << "\"code\":\"" << escapeJson(error.code) << "\","
           << "\"severity\":\"" << severityToString(error.severity) << "\","
           << "\"category\":\"" << error.category << "\","
           << "\"timestamp\":\"" << error.timestamp << "\""
           << "}";
        return ss.str();
    }

    std::string errorToText(const CompileError& error) {
        std::stringstream ss;
        if (!error.file.empty()) {
            ss << error.file << ":" << error.line << ":" << error.column << " ";
        }
        ss << "[" << error.category << "] "
           << "[" << severityToString(error.severity) << "] "
           << error.message;
        if (!error.code.empty()) {
            ss << " (code: " << error.code << ")";
        }
        return ss.str();
    }

    void exportToJson(const std::string& output_file) {
        std::lock_guard<std::mutex> lock(mutex_);
        std::ofstream file(output_file);
        if (!file.is_open()) return;

        file << "{\"errors\":[";
        for (size_t i = 0; i < errors_.size(); ++i) {
            file << errorToJson(errors_[i]);
            if (i < errors_.size() - 1) file << ",";
        }
        file << "],\"summary\":{"
             << "\"total\":" << errors_.size() << ","
             << "\"errors\":" << countBySeverity(Severity::ERROR) << ","
             << "\"warnings\":" << countBySeverity(Severity::WARNING) << ","
             << "\"critical\":" << countBySeverity(Severity::CRITICAL)
             << "}}";
    }

    int countBySeverity(Severity sev) {
        int count = 0;
        for (const auto& err : errors_) {
            if (err.severity == sev) count++;
        }
        return count;
    }

    int getErrorCount() {
        std::lock_guard<std::mutex> lock(mutex_);
        return errors_.size();
    }

    void clear() {
        std::lock_guard<std::mutex> lock(mutex_);
        errors_.clear();
    }

private:
    std::string escapeJson(const std::string& s) {
        std::string result;
        for (char c : s) {
            switch (c) {
                case '\"': result += "\\\""; break;
                case '\\': result += "\\\\"; break;
                case '\n': result += "\\n"; break;
                case '\r': result += "\\r"; break;
                case '\t': result += "\\t"; break;
                default: result += c;
            }
        }
        return result;
    }
};

// Global logger instance
inline Logger& getLogger() {
    static Logger logger("logs/cpp-errors.log", true);
    return logger;
}

// Convenience macros (similar to svelte-check output)
#define CPP_LOG_INFO(msg, category) \
    ErrorLogger::getLogger().logInfo(msg, category)

#define CPP_LOG_WARNING(file, line, msg, category) \
    ErrorLogger::getLogger().logWarning(file, line, msg, category)

#define CPP_LOG_ERROR(file, line, col, msg, code, category) \
    ErrorLogger::getLogger().logError(file, line, col, msg, code, category)

#define CPP_LOG_CRITICAL(msg, category) \
    ErrorLogger::getLogger().logCritical(msg, category)

// CUDA error checking macro
#define CUDA_CHECK(call) \
    do { \
        cudaError_t err = call; \
        if (err != cudaSuccess) { \
            ErrorLogger::getLogger().logError( \
                __FILE__, __LINE__, 0, \
                std::string("CUDA error: ") + cudaGetErrorString(err), \
                std::to_string(err), "CUDA" \
            ); \
            throw std::runtime_error(cudaGetErrorString(err)); \
        } \
    } while(0)

// LibTorch error checking macro
#define TORCH_CHECK_ERROR(condition, msg) \
    do { \
        if (!(condition)) { \
            ErrorLogger::getLogger().logError( \
                __FILE__, __LINE__, 0, msg, "", "LibTorch" \
            ); \
            throw std::runtime_error(msg); \
        } \
    } while(0)

} // namespace ErrorLogger
