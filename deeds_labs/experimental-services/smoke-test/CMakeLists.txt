cmake_minimum_required(VERSION 3.18)
project(smoke_test_wrapper LANGUAGES CXX)

add_subdirectory(../tensorrt-smoketest ${CMAKE_BINARY_DIR}/tensorrt_smoketest_build)

add_custom_target(run_smoke_test
    COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR}/tensorrt_smoketest_build --target tensorrt_smoketest
    COMMAND ${CMAKE_COMMAND} -E chdir ${CMAKE_BINARY_DIR}/tensorrt_smoketest_build ${CMAKE_COMMAND} --build .
    COMMAND ${CMAKE_COMMAND} -E chdir ${CMAKE_BINARY_DIR}/tensorrt_smoketest_build ${CMAKE_COMMAND} -E echo "To run: ${CMAKE_BINARY_DIR}/tensorrt_smoketest_build/tensorrt_smoketest"
)
