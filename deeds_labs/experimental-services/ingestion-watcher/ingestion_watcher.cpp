#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <filesystem>
#include <chrono>
#include <thread>
#include <atomic>
#include <mutex>
#include <condition_variable>
#include <regex>
#include <openssl/sha.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/inotify.h>
#include <linux/limits.h>

namespace fs = std::filesystem;

class IngestionWatcher {
private:
    std::atomic<bool> running_{true};
    std::mutex queue_mutex_;
    std::condition_variable cv_;
    std::vector<std::string> file_queue_;
    std::unordered_map<std::string, std::string> file_hashes_;
    std::unordered_set<std::string> deny_extensions_ = {
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".ico",
        ".zip", ".tar", ".gz", ".rar", ".7z",
        ".o", ".obj", ".exe", ".dll", ".so", ".dylib", ".pdb",
        ".class", ".jar"
    };

    // File patterns to watch
    std::vector<std::regex> watch_patterns_ = {
        std::regex(R"(.*\.(cpp|cu|hpp|cuh|c\+\+|cc|cxx))$"),  // C/C++ files
        std::regex(R"(.*\.(svelte|ts|tsx|js|jsx))$"),         // Frontend files
        std::regex(R"(.*\.(txt|md|rst|adoc))$"),              // Documentation
        std::regex(R"(.*\.(py|sh|bat|ps1))$"),                // Scripts
        std::regex(R"(.*\.(json|yaml|yml|toml|ini|cfg))$"),   // Config files
        std::regex(R"(.*\.(proto|cmake|make|dockerfile))$")   // Build files
    };

    int inotify_fd_;
    std::unordered_map<int, std::string> watch_descriptors_;

public:
    IngestionWatcher() : inotify_fd_(inotify_init()) {
        if (inotify_fd_ < 0) {
            throw std::runtime_error("Failed to initialize inotify");
        }

        // Set non-blocking mode
        int flags = fcntl(inotify_fd_, F_GETFL, 0);
        fcntl(inotify_fd_, F_SETFL, flags | O_NONBLOCK);
    }

    ~IngestionWatcher() {
        running_ = false;
        cv_.notify_all();

        for (const auto& [wd, path] : watch_descriptors_) {
            inotify_rm_watch(inotify_fd_, wd);
        }

        close(inotify_fd_);
    }

    void add_watch_directory(const std::string& path) {
        int wd = inotify_add_watch(inotify_fd_, path.c_str(),
            IN_MODIFY | IN_CREATE | IN_DELETE | IN_MOVED_FROM | IN_MOVED_TO);

        if (wd < 0) {
            std::cerr << "Failed to watch directory: " << path << std::endl;
            return;
        }

        watch_descriptors_[wd] = path;
        std::cout << "Watching directory: " << path << std::endl;

        // Recursively add subdirectories
        try {
            for (const auto& entry : fs::recursive_directory_iterator(path)) {
                if (entry.is_directory()) {
                    add_watch_directory(entry.path().string());
                }
            }
        } catch (const std::exception& e) {
            std::cerr << "Error scanning subdirectories: " << e.what() << std::endl;
        }
    }

    bool should_process_file(const std::string& filepath) {
        // Check file extension deny list
        fs::path path(filepath);
        std::string ext = path.extension().string();
        if (deny_extensions_.count(ext) > 0) {
            return false;
        }

        // Check file size (max 10MB)
        try {
            if (fs::file_size(path) > 10 * 1024 * 1024) {
                return false;
            }
        } catch (const std::exception&) {
            return false; // Can't get size, skip
        }

        // Check if file matches watch patterns
        std::string filename = path.filename().string();
        for (const auto& pattern : watch_patterns_) {
            if (std::regex_match(filename, pattern)) {
                return true;
            }
        }

        return false;
    }

    std::string calculate_file_hash(const std::string& filepath) {
        std::ifstream file(filepath, std::ios::binary);
        if (!file) {
            return "";
        }

        SHA256_CTX sha256;
        SHA256_Init(&sha256);

        char buffer[8192];
        while (file.read(buffer, sizeof(buffer))) {
            SHA256_Update(&sha256, buffer, file.gcount());
        }
        SHA256_Update(&sha256, buffer, file.gcount());

        unsigned char hash[SHA256_DIGEST_LENGTH];
        SHA256_Final(hash, &sha256);

        char hex_hash[SHA256_DIGEST_LENGTH * 2 + 1];
        for (int i = 0; i < SHA256_DIGEST_LENGTH; ++i) {
            sprintf(hex_hash + (i * 2), "%02x", hash[i]);
        }
        hex_hash[SHA256_DIGEST_LENGTH * 2] = '\0';

        return std::string(hex_hash);
    }

    void process_file_change(const std::string& filepath) {
        if (!should_process_file(filepath)) {
            return;
        }

        std::string current_hash = calculate_file_hash(filepath);
        if (current_hash.empty()) {
            return; // File not accessible
        }

        auto it = file_hashes_.find(filepath);
        if (it != file_hashes_.end() && it->second == current_hash) {
            return; // No change
        }

        file_hashes_[filepath] = current_hash;

        // Add to processing queue
        {
            std::lock_guard<std::mutex> lock(queue_mutex_);
            file_queue_.push_back(filepath);
        }
        cv_.notify_one();

        std::cout << "File changed: " << filepath << std::endl;
    }

    void process_events() {
        const size_t BUF_LEN = 4096;
        char buffer[BUF_LEN];

        while (running_) {
            ssize_t length = read(inotify_fd_, buffer, BUF_LEN);
            if (length < 0) {
                if (errno != EAGAIN) {
                    std::cerr << "Error reading inotify events" << std::endl;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
                continue;
            }

            size_t i = 0;
            while (i < static_cast<size_t>(length)) {
                struct inotify_event* event = reinterpret_cast<struct inotify_event*>(&buffer[i]);

                if (event->len > 0) {
                    auto it = watch_descriptors_.find(event->wd);
                    if (it != watch_descriptors_.end()) {
                        std::string filepath = it->second + "/" + event->name;

                        if (event->mask & (IN_MODIFY | IN_CREATE | IN_MOVED_TO)) {
                            // Small delay to ensure file is fully written
                            std::this_thread::sleep_for(std::chrono::milliseconds(50));
                            process_file_change(filepath);
                        }
                    }
                }

                i += sizeof(struct inotify_event) + event->len;
            }
        }
    }

    void process_queue() {
        while (running_) {
            std::string filepath;
            {
                std::unique_lock<std::mutex> lock(queue_mutex_);
                cv_.wait(lock, [this]() {
                    return !file_queue_.empty() || !running_;
                });

                if (!running_) break;

                filepath = file_queue_.front();
                file_queue_.erase(file_queue_.begin());
            }

            // Call Python embedding service
            call_embedding_service(filepath);
        }
    }

    void call_embedding_service(const std::string& filepath) {
        std::string command = "python3 ../embedding-service/embedding_service.py --file \"" + filepath + "\"";

        int result = system(command.c_str());
        if (result != 0) {
            std::cerr << "Failed to process file: " << filepath << std::endl;
        } else {
            std::cout << "Successfully processed: " << filepath << std::endl;
        }
    }

    void load_existing_hashes(const std::string& hash_file) {
        std::ifstream file(hash_file);
        if (!file) {
            return; // No existing hashes
        }

        std::string line;
        while (std::getline(file, line)) {
            size_t separator_pos = line.find(':');
            if (separator_pos != std::string::npos) {
                std::string filepath = line.substr(0, separator_pos);
                std::string hash = line.substr(separator_pos + 1);
                file_hashes_[filepath] = hash;
            }
        }
    }

    void save_hashes(const std::string& hash_file) {
        std::ofstream file(hash_file);
        if (!file) {
            std::cerr << "Failed to save hash file: " << hash_file << std::endl;
            return;
        }

        for (const auto& [filepath, hash] : file_hashes_) {
            file << filepath << ":" << hash << std::endl;
        }
    }

    void run(const std::vector<std::string>& watch_dirs, const std::string& hash_file = "file_hashes.txt") {
        // Load existing hashes
        load_existing_hashes(hash_file);

        // Add watch directories
        for (const auto& dir : watch_dirs) {
            add_watch_directory(dir);
        }

        // Start processing threads
        std::thread event_thread(&IngestionWatcher::process_events, this);
        std::thread queue_thread(&IngestionWatcher::process_queue, this);

        // Set up signal handler for clean shutdown
        signal(SIGINT, [](int) {
            std::cout << "\nShutting down ingestion watcher..." << std::endl;
            exit(0);
        });

        // Save hashes periodically
        while (running_) {
            std::this_thread::sleep_for(std::chrono::minutes(5));
            save_hashes(hash_file);
        }

        event_thread.join();
        queue_thread.join();

        // Save final hashes
        save_hashes(hash_file);
    }
};

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <watch_directory> [watch_directory2 ...]" << std::endl;
        return 1;
    }

    try {
        IngestionWatcher watcher;

        std::vector<std::string> watch_dirs;
        for (int i = 1; i < argc; ++i) {
            watch_dirs.push_back(argv[i]);
        }

        watcher.run(watch_dirs);

    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}