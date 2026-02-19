# Adjust these paths to your CUDA and TensorRT installations
CUDA_PATH ?= /usr/local/cuda
TENSORRT_PATH ?= /usr/src/tensorrt

# Compiler and linker flags
CXX = g++
CXXFLAGS = -std=c++17 -Wall -fPIC
LDFLAGS = -shared

# CUDA and TensorRT include and library paths
INCLUDES = -I$(CUDA_PATH)/include -I$(TENSORRT_PATH)/include
LIBS = -L$(CUDA_PATH)/lib64 -lcudart -L$(TENSORRT_PATH)/lib -lnvinfer -lnvparsers -lnvonnxparser

TARGET = libembedding_trt.so
SOURCES = embedding_trt.c

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(SOURCES)
	$(CXX) $(CXXFLAGS) $(INCLUDES) $(SOURCES) $(LDFLAGS) $(LIBS) -o $@

clean:
	rm -f $(TARGET) *.o
