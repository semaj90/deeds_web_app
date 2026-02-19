cmake_minimum_required(VERSION 3.13)
project(SomAutoEncoder LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)

option(BUILD_WASM "Build WASM module via Emscripten" OFF)
option(USE_TENSORRT "Link against TensorRT (requires ONNX export)" OFF)

if(BUILD_WASM)
  add_executable(som_autoencoder som_autoencoder.cpp)
  set_target_properties(som_autoencoder PROPERTIES
    LINK_FLAGS "-s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_NAME=\"createAutoencoderModule\""
  )
else()
  find_package(Torch REQUIRED)
  add_executable(som_autoencoder som_autoencoder.cpp)
  target_link_libraries(som_autoencoder "${TORCH_LIBRARIES}")
  if (USE_TENSORRT)
    find_library(TENSORRT_LIB nvinfer PATHS /usr/lib/x86_64-linux-gnu)
    if(TENSORRT_LIB)
      target_link_libraries(som_autoencoder "${TENSORRT_LIB}")
    endif()
  endif()
endif()

set_property(TARGET som_autoencoder PROPERTY CXX_STANDARD 17)
