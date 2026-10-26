#include "tile_assembler.hpp"

#include <torch/extension.h>

#include <cstdint>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <vector>

namespace {

torch::Tensor materialize_lod_blocks_cpu(const std::vector<pybind11::bytes>& encoded_blocks) {
    if (encoded_blocks.empty()) {
        throw std::invalid_argument("LOD_BLOCKS_MUST_NOT_BE_EMPTY");
    }

    auto owner = std::make_shared<std::vector<atlas::native::LodTextureBlock128B>>(encoded_blocks.size());
    for (std::size_t index = 0; index < encoded_blocks.size(); ++index) {
        const std::string block = static_cast<std::string>(encoded_blocks[index]);
        if (block.size() != sizeof(atlas::native::LodTextureBlock128B)) {
            throw std::invalid_argument("EACH_LOD_TEXTURE_BLOCK_MUST_BE_128_BYTES");
        }
        std::memcpy(&owner->at(index), block.data(), block.size());
    }

    auto* data = reinterpret_cast<std::uint8_t*>(owner->data());
    if (reinterpret_cast<std::uintptr_t>(data) % alignof(atlas::native::LodTextureBlock128B) != 0) {
        throw std::runtime_error("LOD_TENSOR_BASE_ALIGNMENT_INVALID");
    }

    const auto count = static_cast<std::int64_t>(owner->size());
    const auto options = torch::TensorOptions().dtype(torch::kUInt8).device(torch::kCPU);
    return torch::from_blob(
        data,
        {count, static_cast<std::int64_t>(sizeof(atlas::native::LodTextureBlock128B))},
        [owner = std::move(owner)](void*) mutable { owner.reset(); },
        options);
}

}

PYBIND11_MODULE(_atlas_aten_bridge, module) {
    module.def("materialize_lod_blocks_cpu", &materialize_lod_blocks_cpu);
}
