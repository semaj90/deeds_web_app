#pragma once

#include <cstddef>
#include <cstdint>

enum class AtlasExecutionCounter : std::size_t {
  cuda_execution = 0,
  cpu_fallback = 1,
  stub_invocation = 2,
  cuda_error_fallback = 3,
  oom_fallback = 4,
  count = 5,
};

extern "C" void atlasNativeCounterRecord(AtlasExecutionCounter counter);
extern "C" void atlasNativeCounterSnapshot(std::uint64_t* values, std::size_t length);
extern "C" void atlasNativeCounterReset();
