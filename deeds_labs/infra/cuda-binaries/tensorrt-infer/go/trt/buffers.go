package trt

/*
#include <cuda_runtime.h>
*/
import "C"

import (
	"fmt"
	"unsafe"
)

func mallocDevice(size int) unsafe.Pointer {
	var ptr unsafe.Pointer
	if err := C.cudaMalloc(&ptr, C.size_t(size)); err != 0 {
		panic(fmt.Errorf("cudaMalloc: %v", err))
	}
	return ptr
}

func memcpyHtoD(dst unsafe.Pointer, src []float32) {
	C.cudaMemcpy(
		dst,
		unsafe.Pointer(&src[0]),
		C.size_t(len(src)*4),
		C.cudaMemcpyHostToDevice,
	)
}

func memcpyDtoH(dst []float32, src unsafe.Pointer) {
	C.cudaMemcpy(
		unsafe.Pointer(&dst[0]),
		src,
		C.size_t(len(dst)*4),
		C.cudaMemcpyDeviceToHost,
	)
}

// AllocPinned allocates pinned (page-locked) host memory for faster GPU transfers
func AllocPinned(size int) (unsafe.Pointer, error) {
	var ptr unsafe.Pointer
	err := C.cudaHostAlloc(&ptr, C.size_t(size), C.cudaHostAllocDefault)
	if err != 0 {
		return nil, fmt.Errorf("cudaHostAlloc failed: %v", err)
	}
	return ptr, nil
}

// FreePinned frees pinned host memory
func FreePinned(ptr unsafe.Pointer) error {
	err := C.cudaFreeHost(ptr)
	if err != 0 {
		return fmt.Errorf("cudaFreeHost failed: %v", err)
	}
	return nil
}

// MemcpyPinnedToDevice copies from pinned host memory to device (non-blocking)
func MemcpyPinnedToDevice(dst unsafe.Pointer, src unsafe.Pointer, size int, stream unsafe.Pointer) error {
	err := C.cudaMemcpyAsync(
		dst,
		src,
		C.size_t(size),
		C.cudaMemcpyHostToDevice,
		(C.cudaStream_t)(stream),
	)
	if err != 0 {
		return fmt.Errorf("cudaMemcpyAsync H2D failed: %v", err)
	}
	return nil
}

// MemcpyDeviceToPinned copies from device to pinned host memory (non-blocking)
func MemcpyDeviceToPinned(dst unsafe.Pointer, src unsafe.Pointer, size int, stream unsafe.Pointer) error {
	err := C.cudaMemcpyAsync(
		dst,
		src,
		C.size_t(size),
		C.cudaMemcpyDeviceToHost,
		(C.cudaStream_t)(stream),
	)
	if err != 0 {
		return fmt.Errorf("cudaMemcpyAsync D2H failed: %v", err)
	}
	return nil
}