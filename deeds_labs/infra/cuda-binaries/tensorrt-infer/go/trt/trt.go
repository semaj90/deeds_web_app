package trt

/*
#cgo CFLAGS: -I${SRCDIR}/../cpp -IC:/TensorRT/include
#cgo LDFLAGS: -LC:/TensorRT/lib -lnvinfer -lcudart -L${SRCDIR} -ltrt_wrapper

#include "trt_wrapper.h"
#include <cuda_runtime.h>
*/
import "C"