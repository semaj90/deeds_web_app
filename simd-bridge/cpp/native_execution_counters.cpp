#include "native_execution_counters.h"

#include <array>
#include <atomic>

namespace {
std::array<std::atomic<std::uint64_t>, static_cast<std::size_t>(AtlasExecutionCounter::count)> counters{};
}

extern "C" void atlasNativeCounterRecord(AtlasExecutionCounter counter) {
  const auto index = static_cast<std::size_t>(counter);
  if (index < counters.size()) counters[index].fetch_add(1, std::memory_order_relaxed);
}

extern "C" void atlasNativeCounterSnapshot(std::uint64_t* values, std::size_t length) {
  if (!values) return;
  const auto count = length < counters.size() ? length : counters.size();
  for (std::size_t i = 0; i < count; ++i) values[i] = counters[i].load(std::memory_order_relaxed);
}

extern "C" void atlasNativeCounterReset() {
  for (auto& counter : counters) counter.store(0, std::memory_order_relaxed);
}
