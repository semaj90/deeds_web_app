package trt

/*
#cgo CFLAGS: -I${SRCDIR}/../cpp -IC:/TensorRT/include
#cgo LDFLAGS: -LC:/TensorRT/lib -lnvinfer -lcudart -L${SRCDIR}/../cpp -ltrt_wrapper -lchr97_gpu_kernels

#include "chr97_gpu_kernels.cu"
#include <cuda_runtime.h>
*/
import "C"

import (
	"fmt"
	"unsafe"
)

// GPU Tile Processor
type GPUTileProcessor struct {
	stream C.cudaStream_t
}

// New GPU processor
func NewGPUTileProcessor() (*GPUTileProcessor, error) {
	var stream C.cudaStream_t
	if err := C.cudaStreamCreate(&stream); err != 0 {
		return nil, fmt.Errorf("failed to create CUDA stream: %v", err)
	}

	return &GPUTileProcessor{stream: stream}, nil
}

// Process tiles on GPU
func (p *GPUTileProcessor) ProcessTiles(
	tileAtlas []byte,
	tensorDim int,
) ([][]float32, error) {

	tileCount := len(tileAtlas) / 1024 // 32x32 tiles
	if len(tileAtlas)%1024 != 0 {
		return nil, fmt.Errorf("invalid tile atlas size")
	}

	// Allocate GPU memory
	var dTileAtlas unsafe.Pointer
	var dOutput unsafe.Pointer

	sizeTiles := C.size_t(len(tileAtlas))
	sizeOutput := C.size_t(tileCount * tensorDim * 4) // float32

	if err := C.cudaMalloc(&dTileAtlas, sizeTiles); err != 0 {
		return nil, fmt.Errorf("cudaMalloc tiles failed: %v", err)
	}
	defer C.cudaFree(dTileAtlas)

	if err := C.cudaMalloc(&dOutput, sizeOutput); err != 0 {
		return nil, fmt.Errorf("cudaMalloc output failed: %v", err)
	}
	defer C.cudaFree(dOutput)

	// Copy input to GPU
	if err := C.cudaMemcpy(dTileAtlas, unsafe.Pointer(&tileAtlas[0]), sizeTiles, C.cudaMemcpyHostToDevice); err != 0 {
		return nil, fmt.Errorf("cudaMemcpy HtoD failed: %v", err)
	}

	// Launch kernel
	if err := C.processCHR97Tiles(
		(*C.uchar)(dTileAtlas),
		(*C.float)(dOutput),
		C.uint(tileCount),
		C.uint(tensorDim),
		p.stream,
	); err != 0 {
		return nil, fmt.Errorf("kernel launch failed: %v", err)
	}

	// Copy result back
	output := make([]float32, tileCount*tensorDim)
	if err := C.cudaMemcpy(
		unsafe.Pointer(&output[0]),
		dOutput,
		sizeOutput,
		C.cudaMemcpyDeviceToHost,
	); err != 0 {
		return nil, fmt.Errorf("cudaMemcpy DtoH failed: %v", err)
	}

	// Reshape to 2D
	result := make([][]float32, tileCount)
	for i := 0; i < tileCount; i++ {
		result[i] = output[i*tensorDim : (i+1)*tensorDim]
	}

	return result, nil
}

// Project to 4D manifold
func (p *GPUTileProcessor) ProjectManifold(tensors [][]float32) ([][]float32, error) {
	if len(tensors) == 0 {
		return nil, fmt.Errorf("empty tensor array")
	}

	tensorDim := len(tensors[0])
	tensorCount := len(tensors)

	// Flatten input
	flatInput := make([]float32, 0, tensorCount*tensorDim)
	for _, tensor := range tensors {
		flatInput = append(flatInput, tensor...)
	}

	// Allocate GPU memory
	var dInput, dOutput unsafe.Pointer
	sizeInput := C.size_t(len(flatInput) * 4)
	sizeOutput := C.size_t(tensorCount * 4 * 4) // 4D coords

	if err := C.cudaMalloc(&dInput, sizeInput); err != 0 {
		return nil, fmt.Errorf("cudaMalloc input failed: %v", err)
	}
	defer C.cudaFree(dInput)

	if err := C.cudaMalloc(&dOutput, sizeOutput); err != 0 {
		return nil, fmt.Errorf("cudaMalloc output failed: %v", err)
	}
	defer C.cudaFree(dOutput)

	// Copy input
	if err := C.cudaMemcpy(dInput, unsafe.Pointer(&flatInput[0]), sizeInput, C.cudaMemcpyHostToDevice); err != 0 {
		return nil, fmt.Errorf("cudaMemcpy input failed: %v", err)
	}

	// Launch kernel
	if err := C.projectCHR97Manifold(
		(*C.float)(dInput),
		(*C.float)(dOutput),
		C.uint(tensorCount),
		C.uint(tensorDim),
		p.stream,
	); err != 0 {
		return nil, fmt.Errorf("manifold kernel failed: %v", err)
	}

	// Copy result
	flatOutput := make([]float32, tensorCount*4)
	if err := C.cudaMemcpy(
		unsafe.Pointer(&flatOutput[0]),
		dOutput,
		sizeOutput,
		C.cudaMemcpyDeviceToHost,
	); err != 0 {
		return nil, fmt.Errorf("cudaMemcpy output failed: %v", err)
	}

	// Reshape
	result := make([][]float32, tensorCount)
	for i := 0; i < tensorCount; i++ {
		result[i] = flatOutput[i*4 : (i+1)*4]
	}

	return result, nil
}

// Quantize tensors to INT4
func (p *GPUTileProcessor) QuantizeTensors(tensors [][]float32) ([][]byte, error) {
	if len(tensors) == 0 {
		return nil, fmt.Errorf("empty tensor array")
	}

	tensorDim := len(tensors[0])
	tensorCount := len(tensors)

	// Flatten
	flatInput := make([]float32, 0, tensorCount*tensorDim)
	for _, tensor := range tensors {
		flatInput = append(flatInput, tensor...)
	}

	// Allocate GPU memory
	var dInput unsafe.Pointer
	var dOutput unsafe.Pointer

	sizeInput := C.size_t(len(flatInput) * 4)
	sizeOutput := C.size_t(tensorCount * tensorDim / 2) // 2 int4 per byte

	if err := C.cudaMalloc(&dInput, sizeInput); err != 0 {
		return nil, fmt.Errorf("cudaMalloc input failed: %v", err)
	}
	defer C.cudaFree(dInput)

	if err := C.cudaMalloc(&dOutput, sizeOutput); err != 0 {
		return nil, fmt.Errorf("cudaMalloc output failed: %v", err)
	}
	defer C.cudaFree(dOutput)

	// Copy input
	if err := C.cudaMemcpy(dInput, unsafe.Pointer(&flatInput[0]), sizeInput, C.cudaMemcpyHostToDevice); err != 0 {
		return nil, fmt.Errorf("cudaMemcpy input failed: %v", err)
	}

	// Launch kernel
	if err := C.quantizeCHR97Tensors(
		(*C.float)(dInput),
		(*C.uchar)(dOutput),
		C.uint(tensorCount),
		C.uint(tensorDim),
		p.stream,
	); err != 0 {
		return nil, fmt.Errorf("quantize kernel failed: %v", err)
	}

	// Copy result
	flatOutput := make([]byte, tensorCount*tensorDim/2)
	if err := C.cudaMemcpy(
		unsafe.Pointer(&flatOutput[0]),
		dOutput,
		sizeOutput,
		C.cudaMemcpyDeviceToHost,
	); err != 0 {
		return nil, fmt.Errorf("cudaMemcpy output failed: %v", err)
	}

	// Reshape
	result := make([][]byte, tensorCount)
	for i := 0; i < tensorCount; i++ {
		result[i] = flatOutput[i*(tensorDim/2) : (i+1)*(tensorDim/2)]
	}

	return result, nil
}

// Process graph on GPU
func (p *GPUTileProcessor) ProcessGraph(
	offsets []uint32,
	edges []uint32,
	nodeFeatures [][]float32,
) ([][]float32, error) {

	if len(nodeFeatures) == 0 {
		return nil, fmt.Errorf("empty node features")
	}

	nodeCount := len(nodeFeatures)
	featureDim := len(nodeFeatures[0])

	// Flatten features
	flatFeatures := make([]float32, 0, nodeCount*featureDim)
	for _, features := range nodeFeatures {
		flatFeatures = append(flatFeatures, features...)
	}

	// Allocate GPU memory
	var dOffsets, dEdges, dFeatures, dOutput unsafe.Pointer

	sizeOffsets := C.size_t(len(offsets) * 4)
	sizeEdges := C.size_t(len(edges) * 4)
	sizeFeatures := C.size_t(len(flatFeatures) * 4)
	sizeOutput := C.size_t(nodeCount * featureDim * 4)

	if err := C.cudaMalloc(&dOffsets, sizeOffsets); err != 0 {
		return nil, fmt.Errorf("cudaMalloc offsets failed: %v", err)
	}
	defer C.cudaFree(dOffsets)

	if err := C.cudaMalloc(&dEdges, sizeEdges); err != 0 {
		return nil, fmt.Errorf("cudaMalloc edges failed: %v", err)
	}
	defer C.cudaFree(dEdges)

	if err := C.cudaMalloc(&dFeatures, sizeFeatures); err != 0 {
		return nil, fmt.Errorf("cudaMalloc features failed: %v", err)
	}
	defer C.cudaFree(dFeatures)

	if err := C.cudaMalloc(&dOutput, sizeOutput); err != 0 {
		return nil, fmt.Errorf("cudaMalloc output failed: %v", err)
	}
	defer C.cudaFree(dOutput)

	// Copy inputs
	C.cudaMemcpy(dOffsets, unsafe.Pointer(&offsets[0]), sizeOffsets, C.cudaMemcpyHostToDevice)
	C.cudaMemcpy(dEdges, unsafe.Pointer(&edges[0]), sizeEdges, C.cudaMemcpyHostToDevice)
	C.cudaMemcpy(dFeatures, unsafe.Pointer(&flatFeatures[0]), sizeFeatures, C.cudaMemcpyHostToDevice)

	// Launch kernel
	if err := C.traverseCHR97Graph(
		(*C.uint)(dOffsets),
		(*C.uint)(dEdges),
		(*C.float)(dFeatures),
		(*C.float)(dOutput),
		C.uint(nodeCount),
		C.uint(featureDim),
		p.stream,
	); err != 0 {
		return nil, fmt.Errorf("graph kernel failed: %v", err)
	}

	// Copy result
	flatOutput := make([]float32, nodeCount*featureDim)
	C.cudaMemcpy(unsafe.Pointer(&flatOutput[0]), dOutput, sizeOutput, C.cudaMemcpyDeviceToHost)

	// Reshape
	result := make([][]float32, nodeCount)
	for i := 0; i < nodeCount; i++ {
		result[i] = flatOutput[i*featureDim : (i+1)*featureDim]
	}

	return result, nil
}

// Cleanup
func (p *GPUTileProcessor) Close() {
	if p.stream != nil {
		C.cudaStreamDestroy(p.stream)
		p.stream = nil
	}
}