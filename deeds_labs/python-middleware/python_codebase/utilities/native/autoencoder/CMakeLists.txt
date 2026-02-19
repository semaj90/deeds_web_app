cmake_minimum_required(VERSION 3.15)
project(som_autoencoder)

# Set this to your local libtorch location (download from pytorch.org)
set(LIBTORCH_DIR "${CMAKE_SOURCE_DIR}/libtorch")

find_package(Torch REQUIRED PATHS ${LIBTORCH_DIR} NO_DEFAULT_PATH)

add_executable(som_autoencoder som_autoencoder.cpp)
target_link_libraries(som_autoencoder "${TORCH_LIBRARIES}")
set_property(TARGET som_autoencoder PROPERTY CXX_STANDARD 14)
