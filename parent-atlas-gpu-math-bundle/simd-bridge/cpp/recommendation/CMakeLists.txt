cmake_minimum_required(VERSION 3.18)
project(atlas_libtorch_recommendation_reference LANGUAGES CXX)

# TODO(TEST-LATER): configure with one of:
#   cmake -S . -B build -DCMAKE_PREFIX_PATH="<libtorch-root>"
#   cmake -S . -B build -DTorch_DIR="<libtorch>/share/cmake/Torch"
# This target is intentionally isolated from the existing GEMM bundle until the
# workstation proves ABI/toolchain compatibility with its installed Torch.

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Torch REQUIRED)

add_library(atlas_libtorch_recommendation_reference STATIC
  libtorch_rerank_reference.cpp
)

target_link_libraries(atlas_libtorch_recommendation_reference PRIVATE "${TORCH_LIBRARIES}")
target_compile_features(atlas_libtorch_recommendation_reference PRIVATE cxx_std_17)

# TODO(TEST-LATER): add a tiny executable parity harness that loads a JSON fixture,
# runs CPU and CUDA tensors through the same formula, and emits
# atlas.recommendation-math-parity-report.v1.
# TODO(TEST-LATER): do not promote this target into the root bundle until that
# report proves numeric parity and the CUDA allocator fits the workstation budget.
