#include "bounded_work_queue.hpp"

#include <cassert>
#include <chrono>
#include <iostream>
#include <thread>
#include <vector>

using namespace atlas::scheduler;

int main() {
    std::cout << "[REG-04] Running Bounded Work Queue & Scheduler Smoke Test...\n";

    // 1. Priority Ordering & FIFO Tie-Breaking
    BoundedWorkQueueV1 queue(5);
    auto now = std::chrono::steady_clock::now();
    auto future_deadline = now + std::chrono::seconds(10);

    AtlasWorkItemV1 low_prio{
        .request_id = "req-low",
        .operation = WorkOperation::Rank,
        .priority = 10,
        .deadline = future_deadline,
    };
    AtlasWorkItemV1 high_prio{
        .request_id = "req-high",
        .operation = WorkOperation::Project,
        .priority = 100,
        .deadline = future_deadline,
    };
    AtlasWorkItemV1 mid_prio{
        .request_id = "req-mid",
        .operation = WorkOperation::Load,
        .priority = 50,
        .deadline = future_deadline,
    };

    assert(queue.try_push(low_prio));
    assert(queue.try_push(high_prio));
    assert(queue.try_push(mid_prio));

    auto item1 = queue.pop();
    assert(item1.has_value() && item1->request_id == "req-high");

    auto item2 = queue.pop();
    assert(item2.has_value() && item2->request_id == "req-mid");

    auto item3 = queue.pop();
    assert(item3.has_value() && item3->request_id == "req-low");

    std::cout << "  PASS: Priority ordering verified (high -> mid -> low).\n";

    // 2. Capacity & Backpressure Rejection
    BoundedWorkQueueV1 small_queue(2);
    assert(small_queue.try_push(low_prio));
    assert(small_queue.try_push(mid_prio));
    assert(!small_queue.try_push(high_prio)); // Backpressure: capacity exceeded

    auto metrics = small_queue.metrics();
    assert(metrics.pushed_count == 2);
    assert(metrics.rejected_backpressure_count == 1);
    std::cout << "  PASS: Backpressure rejection and capacity boundary verified.\n";

    // 3. Expiration Filtering
    BoundedWorkQueueV1 expire_queue(5);
    auto past_deadline = now - std::chrono::seconds(1);
    AtlasWorkItemV1 expired_item{
        .request_id = "req-expired",
        .operation = WorkOperation::Evict,
        .priority = 200,
        .deadline = past_deadline,
    };
    AtlasWorkItemV1 fresh_item{
        .request_id = "req-fresh",
        .operation = WorkOperation::Rank,
        .priority = 10,
        .deadline = future_deadline,
    };

    assert(expire_queue.try_push(expired_item));
    assert(expire_queue.try_push(fresh_item));

    auto popped_fresh = expire_queue.pop();
    assert(popped_fresh.has_value() && popped_fresh->request_id == "req-fresh");

    metrics = expire_queue.metrics();
    assert(metrics.expired_count == 1);
    assert(metrics.popped_count == 1);
    std::cout << "  PASS: Deadline expiration filtering verified.\n";

    // 4. Cancellation Filtering
    BoundedWorkQueueV1 cancel_queue(5);
    AtlasWorkItemV1 cancelled_item{
        .request_id = "req-cancelled",
        .operation = WorkOperation::Rank,
        .priority = 300,
        .deadline = future_deadline,
        .cancelled = true,
    };

    assert(cancel_queue.try_push(cancelled_item));
    assert(cancel_queue.try_push(fresh_item));

    auto popped_non_cancelled = cancel_queue.pop();
    assert(popped_non_cancelled.has_value() && popped_non_cancelled->request_id == "req-fresh");

    metrics = cancel_queue.metrics();
    assert(metrics.cancelled_count == 1);
    std::cout << "  PASS: Item cancellation filtering verified.\n";

    // 5. Multi-Threaded Producer/Consumer Concurrency
    BoundedWorkQueueV1 concurrent_queue(1000);
    const int num_producers = 4;
    const int items_per_producer = 200;
    std::vector<std::thread> producers;

    for (int p = 0; p < num_producers; ++p) {
        producers.emplace_back([&concurrent_queue, p, items_per_producer, future_deadline]() {
            for (int i = 0; i < items_per_producer; ++i) {
                AtlasWorkItemV1 item{
                    .request_id = "item-" + std::to_string(p) + "-" + std::to_string(i),
                    .operation = WorkOperation::Rank,
                    .priority = static_cast<std::uint32_t>(i % 50),
                    .deadline = future_deadline,
                };
                while (!concurrent_queue.try_push(item)) {
                    std::this_thread::yield();
                }
            }
        });
    }

    std::size_t consumed_count = 0;
    std::thread consumer([&concurrent_queue, &consumed_count, total = num_producers * items_per_producer]() {
        while (consumed_count < static_cast<std::size_t>(total)) {
            auto item = concurrent_queue.pop(std::chrono::milliseconds(5));
            if (item.has_value()) {
                consumed_count++;
            }
        }
    });

    for (auto& t : producers) t.join();
    consumer.join();

    assert(consumed_count == static_cast<std::size_t>(num_producers * items_per_producer));
    metrics = concurrent_queue.metrics();
    assert(metrics.pushed_count == consumed_count);
    assert(metrics.popped_count == consumed_count);
    std::cout << "  PASS: Concurrent multi-producer single-consumer (" << consumed_count << " items) verified with zero loss.\n";

    std::cout << "[REG-04] ALL TESTS PASSED SUCCESSFULLY.\n";
    return 0;
}
