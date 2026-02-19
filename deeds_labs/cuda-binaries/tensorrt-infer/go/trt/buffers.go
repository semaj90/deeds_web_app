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