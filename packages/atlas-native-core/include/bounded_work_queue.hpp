#pragma once

#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <optional>
#include <queue>
#include <string>
#include <vector>

namespace atlas::scheduler {

enum class WorkOperation : std::uint8_t {
    Load = 0,
    Rank,
    Project,
    Evict
};

/**
 * REG-04: Bounded Work Item Descriptor
 */
struct AtlasWorkItemV1 {
    std::string request_id;
    WorkOperation operation{WorkOperation::Rank};
    std::string memory_entry_id;
    std::string expected_revision;
    std::uint32_t priority{0}; // Higher values indicate higher priority
    std::chrono::steady_clock::time_point deadline;
    std::size_t estimated_bytes{0};
    bool cancelled{false};
};

struct WorkItemComparator {
    bool operator()(const AtlasWorkItemV1& a, const AtlasWorkItemV1& b) const noexcept {
        // Higher priority first; tie-break with earlier deadline
        if (a.priority != b.priority) {
            return a.priority < b.priority;
        }
        return a.deadline > b.deadline;
    }
};

struct QueueMetricsV1 {
    std::size_t pushed_count{0};
    std::size_t popped_count{0};
    std::size_t rejected_backpressure_count{0};
    std::size_t expired_count{0};
    std::size_t cancelled_count{0};
};

/**
 * Bounded Priority Work Queue with Backpressure, Cancellation, and Deadline Checks.
 */
class BoundedWorkQueueV1 {
public:
    explicit BoundedWorkQueueV1(std::size_t max_capacity)
        : max_capacity_(max_capacity) {}

    bool try_push(AtlasWorkItemV1 item) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (queue_.size() >= max_capacity_) {
            metrics_.rejected_backpressure_count++;
            return false;
        }
        queue_.push(std::move(item));
        metrics_.pushed_count++;
        cv_.notify_one();
        return true;
    }

    std::optional<AtlasWorkItemV1> pop(std::chrono::milliseconds wait_timeout = std::chrono::milliseconds(0)) {
        std::unique_lock<std::mutex> lock(mutex_);
        auto now = std::chrono::steady_clock::now();

        auto wait_predicate = [this]() { return !queue_.empty() || closed_; };

        if (queue_.empty() && !closed_) {
            if (wait_timeout > std::chrono::milliseconds(0)) {
                cv_.wait_for(lock, wait_timeout, wait_predicate);
            }
        }

        while (!queue_.empty()) {
            AtlasWorkItemV1 top = queue_.top();
            queue_.pop();

            if (top.cancelled) {
                metrics_.cancelled_count++;
                continue;
            }

            if (top.deadline < now) {
                metrics_.expired_count++;
                continue;
            }

            metrics_.popped_count++;
            return top;
        }

        return std::nullopt;
    }

    void close() {
        std::lock_guard<std::mutex> lock(mutex_);
        closed_ = true;
        cv_.notify_all();
    }

    std::size_t size() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return queue_.size();
    }

    std::size_t capacity() const noexcept {
        return max_capacity_;
    }

    QueueMetricsV1 metrics() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return metrics_;
    }

private:
    const std::size_t max_capacity_;
    bool closed_{false};
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    std::priority_queue<AtlasWorkItemV1, std::vector<AtlasWorkItemV1>, WorkItemComparator> queue_;
    QueueMetricsV1 metrics_{};
};

/**
 * Channel Leasing Pool Descriptor for gRPC/RPC channel reuse without recreation.
 */
struct ChannelLeaseV1 {
    std::string endpoint;
    std::uint32_t active_calls{0};
    std::uint32_t max_concurrent_calls{100};
    bool healthy{true};

    bool can_lease() const noexcept {
        return healthy && active_calls < max_concurrent_calls;
    }
};

} // namespace atlas::scheduler
