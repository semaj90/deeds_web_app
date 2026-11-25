#pragma once

#include <cstddef>
#include <cstdint>

namespace atlas::video::v1 {

inline constexpr std::uint32_t kDescriptorVersion = 1;
inline constexpr std::size_t kDescriptorBytes = 64;

enum class PixelFormat : std::uint32_t {
  Gray8 = 1,
  RGB8 = 2,
  RGBA8 = 3,
  NV12 = 4,
};

enum FrameFlags : std::uint32_t {
  Keyframe = 1u,
  Discontinuity = 2u,
};

// Native in-memory mirror of the explicitly little-endian 64-byte wire record.
// Consumers on big-endian hosts must decode fields rather than reinterpret bytes.
struct alignas(64) FrameDescriptor {
  std::uint64_t frame_id;
  std::int64_t pts_us;
  std::uint32_t width;
  std::uint32_t height;
  std::uint32_t row_stride_bytes;
  PixelFormat pixel_format;
  std::uint32_t buffer_offset;
  std::uint32_t buffer_length;
  std::uint32_t generation;
  std::uint32_t flags;
  std::uint32_t version;
  std::uint32_t plane_count;
  std::uint32_t reserved[2];
};

static_assert(sizeof(FrameDescriptor) == kDescriptorBytes);
static_assert(alignof(FrameDescriptor) == 64);
static_assert(offsetof(FrameDescriptor, pts_us) == 8);
static_assert(offsetof(FrameDescriptor, width) == 16);
static_assert(offsetof(FrameDescriptor, pixel_format) == 28);
static_assert(offsetof(FrameDescriptor, version) == 48);
static_assert(offsetof(FrameDescriptor, reserved) == 56);

}  // namespace atlas::video::v1
