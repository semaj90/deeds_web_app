cmake_minimum_required(VERSION 3.24)
project(atlas_native_core VERSION 0.1.0 LANGUAGES CXX)

option(ATLAS_NATIVE_BUILD_TESTS "Build native core contract tests" ON)
option(ATLAS_NATIVE_BUILD_PYTHON "Build the optional pybind11 module" OFF)
option(ATLAS_NATIVE_BUILD_NAPI "Build the optional Node-API addon" OFF)
option(ATLAS_NATIVE_BUILD_ATEN "Build the optional PyTorch ATen bridge" OFF)
set(ATLAS_PYTHON_OUTPUT_DIRECTORY "" CACHE PATH "Optional output directory for the pybind11 extension")

add_library(atlas_native_core INTERFACE)
target_include_directories(atlas_native_core INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}/include")
target_compile_features(atlas_native_core INTERFACE cxx_std_20)

if(ATLAS_NATIVE_BUILD_TESTS)
  enable_testing()
  add_executable(atlas_native_core_smoke tests/native_core_smoke.cc)
  target_link_libraries(atlas_native_core_smoke PRIVATE atlas_native_core)
  add_test(NAME atlas_native_core_smoke COMMAND atlas_native_core_smoke)

  add_executable(atlas_memory_registry_smoke tests/memory_registry_smoke.cc)
  target_link_libraries(atlas_memory_registry_smoke PRIVATE atlas_native_core)
  add_test(NAME atlas_memory_registry_smoke COMMAND atlas_memory_registry_smoke)
  find_program(ATLAS_NODE_EXECUTABLE node)
  if(ATLAS_NODE_EXECUTABLE)
    add_test(NAME atlas_tensor_tile_protobuf_runtime_parity
      COMMAND "${ATLAS_NODE_EXECUTABLE}"
        "${CMAKE_CURRENT_SOURCE_DIR}/tests/tensor_tile_proto_parity.cjs"
        "$<TARGET_FILE:atlas_native_core_smoke>")
    set_tests_properties(atlas_tensor_tile_protobuf_runtime_parity PROPERTIES
      WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../..")
  endif()
endif()

if(ATLAS_NATIVE_BUILD_PYTHON)
  find_package(Python3 REQUIRED COMPONENTS Interpreter Development.Module)
  set(ATLAS_PYBIND11_INCLUDE_DIR "" CACHE PATH "Directory containing pybind11/pybind11.h")
  find_path(ATLAS_PYBIND11_INCLUDE_DIR pybind11/pybind11.h
    HINTS "${ATLAS_PYBIND11_INCLUDE_DIR}"
    REQUIRED)
  Python3_add_library(_atlas_native_core MODULE WITH_SOABI src/pybind_module.cc)
  target_include_directories(_atlas_native_core PRIVATE "${ATLAS_PYBIND11_INCLUDE_DIR}")
  target_link_libraries(_atlas_native_core PRIVATE atlas_native_core)
  if(NOT ATLAS_PYTHON_OUTPUT_DIRECTORY STREQUAL "")
    set_target_properties(_atlas_native_core PROPERTIES
      LIBRARY_OUTPUT_DIRECTORY "${ATLAS_PYTHON_OUTPUT_DIRECTORY}"
      RUNTIME_OUTPUT_DIRECTORY "${ATLAS_PYTHON_OUTPUT_DIRECTORY}"
      LIBRARY_OUTPUT_DIRECTORY_DEBUG "${ATLAS_PYTHON_OUTPUT_DIRECTORY}"
      LIBRARY_OUTPUT_DIRECTORY_RELEASE "${ATLAS_PYTHON_OUTPUT_DIRECTORY}"
      RUNTIME_OUTPUT_DIRECTORY_DEBUG "${ATLAS_PYTHON_OUTPUT_DIRECTORY}"
      RUNTIME_OUTPUT_DIRECTORY_RELEASE "${ATLAS_PYTHON_OUTPUT_DIRECTORY}")
  endif()
  if(ATLAS_NATIVE_BUILD_TESTS)
    add_test(NAME atlas_native_python_parity
      COMMAND Python3::Interpreter
        "${CMAKE_CURRENT_SOURCE_DIR}/tests/native_binding_parity.py"
        "$<TARGET_FILE_DIR:_atlas_native_core>"
        "$<TARGET_FILE:atlas_native_core_smoke>")
    add_test(NAME atlas_tensor_tile_python_wire_parity
      COMMAND Python3::Interpreter
        "${CMAKE_CURRENT_SOURCE_DIR}/tests/tensor_tile_python_parity.py"
        "$<TARGET_FILE:atlas_native_core_smoke>")
  endif()
endif()

if(ATLAS_NATIVE_BUILD_ATEN)
  find_package(Python3 REQUIRED COMPONENTS Interpreter Development.Module)
  execute_process(
    COMMAND "${Python3_EXECUTABLE}" -c "import pathlib, torch; root=pathlib.Path(torch.__file__).parent; print('|'.join((str(root/'include'), str(root/'include/torch/csrc/api/include'), str(root/'lib'), str(int(torch._C._GLIBCXX_USE_CXX11_ABI)))) )"
    OUTPUT_VARIABLE ATLAS_TORCH_METADATA
    OUTPUT_STRIP_TRAILING_WHITESPACE
    RESULT_VARIABLE ATLAS_TORCH_METADATA_RESULT)
  if(NOT ATLAS_TORCH_METADATA_RESULT EQUAL 0 OR ATLAS_TORCH_METADATA STREQUAL "")
    message(FATAL_ERROR "ATLAS_NATIVE_BUILD_ATEN requires importable PyTorch in Python3_EXECUTABLE")
  endif()
  string(REPLACE "|" ";" ATLAS_TORCH_METADATA_LIST "${ATLAS_TORCH_METADATA}")
  list(GET ATLAS_TORCH_METADATA_LIST 0 ATLAS_TORCH_INCLUDE_DIR)
  list(GET ATLAS_TORCH_METADATA_LIST 1 ATLAS_TORCH_API_INCLUDE_DIR)
  list(GET ATLAS_TORCH_METADATA_LIST 2 ATLAS_TORCH_LIBRARY_DIR)
  list(GET ATLAS_TORCH_METADATA_LIST 3 ATLAS_TORCH_CXX11_ABI)
  find_library(ATLAS_TORCH_PYTHON_LIBRARY torch_python
    PATHS "${ATLAS_TORCH_LIBRARY_DIR}" NO_DEFAULT_PATH REQUIRED)
  find_library(ATLAS_TORCH_CPU_LIBRARY torch_cpu
    PATHS "${ATLAS_TORCH_LIBRARY_DIR}" NO_DEFAULT_PATH REQUIRED)
  find_library(ATLAS_TORCH_C10_LIBRARY c10
    PATHS "${ATLAS_TORCH_LIBRARY_DIR}" NO_DEFAULT_PATH REQUIRED)
  Python3_add_library(_atlas_aten_bridge MODULE WITH_SOABI src/aten_bridge.cc)
  target_include_directories(_atlas_aten_bridge PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/include"
    "${ATLAS_TORCH_INCLUDE_DIR}"
    "${ATLAS_TORCH_API_INCLUDE_DIR}")
  target_compile_definitions(_atlas_aten_bridge PRIVATE
    _GLIBCXX_USE_CXX11_ABI=${ATLAS_TORCH_CXX11_ABI})
  target_link_libraries(_atlas_aten_bridge PRIVATE
    atlas_native_core
    "${ATLAS_TORCH_PYTHON_LIBRARY}"
    "${ATLAS_TORCH_CPU_LIBRARY}"
    "${ATLAS_TORCH_C10_LIBRARY}")
  if(NOT ATLAS_PYTHON_OUTPUT_DIRECTORY STREQUAL "")
    set_target_properties(_atlas_aten_bridge PROPERTIES
      LIBRARY_OUTPUT_DIRECTORY "${ATLAS_PYTHON_OUTPUT_DIRECTORY}"
      RUNTIME_OUTPUT_DIRECTORY "${ATLAS_PYTHON_OUTPUT_DIRECTORY}"
      LIBRARY_OUTPUT_DIRECTORY_DEBUG "${ATLAS_PYTHON_OUTPUT_DIRECTORY}"
      LIBRARY_OUTPUT_DIRECTORY_RELEASE "${ATLAS_PYTHON_OUTPUT_DIRECTORY}"
      RUNTIME_OUTPUT_DIRECTORY_DEBUG "${ATLAS_PYTHON_OUTPUT_DIRECTORY}"
      RUNTIME_OUTPUT_DIRECTORY_RELEASE "${ATLAS_PYTHON_OUTPUT_DIRECTORY}")
  endif()
  set_target_properties(_atlas_aten_bridge PROPERTIES
    BUILD_RPATH "${ATLAS_TORCH_LIBRARY_DIR}"
    INSTALL_RPATH "${ATLAS_TORCH_LIBRARY_DIR}")
  if(ATLAS_NATIVE_BUILD_TESTS)
    add_test(NAME atlas_aten_lod_tensor_lifetime
      COMMAND Python3::Interpreter
        "${CMAKE_CURRENT_SOURCE_DIR}/tests/aten_bridge_smoke.py"
        "$<TARGET_FILE_DIR:_atlas_aten_bridge>")
    execute_process(
      COMMAND "${Python3_EXECUTABLE}" -c "import pyarrow"
      RESULT_VARIABLE ATLAS_PYARROW_IMPORT_RESULT
      OUTPUT_QUIET ERROR_QUIET)
    if(ATLAS_PYARROW_IMPORT_RESULT EQUAL 0)
      add_test(NAME atlas_aten_arrow_tile_roundtrip
        COMMAND Python3::Interpreter
          "${CMAKE_CURRENT_SOURCE_DIR}/tests/aten_arrow_tile_smoke.py"
          "$<TARGET_FILE_DIR:_atlas_aten_bridge>")
    endif()
  endif()
endif()

if(ATLAS_NATIVE_BUILD_NAPI)
  set(ATLAS_NODE_ADDON_API_INCLUDE_DIR "" CACHE PATH "Directory containing node-addon-api/napi.h")
  set(ATLAS_NODE_API_INCLUDE_DIR "" CACHE PATH "Directory containing node_api.h")
  find_path(ATLAS_NODE_ADDON_API_INCLUDE_DIR napi.h HINTS "${ATLAS_NODE_ADDON_API_INCLUDE_DIR}" REQUIRED)
  find_path(ATLAS_NODE_API_INCLUDE_DIR node_api.h HINTS "${ATLAS_NODE_API_INCLUDE_DIR}" /usr/include/node REQUIRED)
  find_program(ATLAS_NODE_EXECUTABLE node REQUIRED)
  add_library(atlas_native_core_napi MODULE src/atlas_native_addon.cc)
  target_include_directories(atlas_native_core_napi PRIVATE
    "${ATLAS_NODE_ADDON_API_INCLUDE_DIR}"
    "${ATLAS_NODE_API_INCLUDE_DIR}")
  target_link_libraries(atlas_native_core_napi PRIVATE atlas_native_core)
  if(WIN32)
    set(ATLAS_NODE_API_LIBRARY "" CACHE FILEPATH "Node.js import library for the Windows Node-API addon")
    if(NOT ATLAS_NODE_API_LIBRARY)
      find_library(ATLAS_NODE_API_LIBRARY_FOUND NAMES node
        HINTS "${ATLAS_NODE_API_INCLUDE_DIR}/../../x64"
        REQUIRED)
      set(ATLAS_NODE_API_LIBRARY "${ATLAS_NODE_API_LIBRARY_FOUND}" CACHE FILEPATH
        "Node.js import library for the Windows Node-API addon" FORCE)
    endif()
    target_link_libraries(atlas_native_core_napi PRIVATE "${ATLAS_NODE_API_LIBRARY}")
  endif()
  set_target_properties(atlas_native_core_napi PROPERTIES PREFIX "" SUFFIX ".node" OUTPUT_NAME "atlas_native_core")
  add_test(NAME atlas_native_node_api_smoke
    COMMAND "${ATLAS_NODE_EXECUTABLE}"
        --expose-gc
      "${CMAKE_CURRENT_SOURCE_DIR}/tests/native_addon_smoke.cjs"
      "$<TARGET_FILE_DIR:atlas_native_core_napi>"
      "$<TARGET_FILE:atlas_native_core_smoke>")
endif()
