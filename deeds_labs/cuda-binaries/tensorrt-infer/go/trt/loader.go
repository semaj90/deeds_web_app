package trt

import (
	"fmt"
	"os"
	"unsafe"
)

/*
IRuntime* trtCreateRuntime();
ICudaEngine* trtDeserializeEngine(IRuntime*, void*, size_t);
IExecutionContext* trtCreateContext(ICudaEngine*);
*/
import "C"

type Engine struct {
	Runtime unsafe.Pointer
	Engine  unsafe.Pointer
	Ctx     unsafe.Pointer
}

func LoadPlan(path string) (*Engine, error) {
	blob, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	rt := C.trtCreateRuntime()
	if rt == nil {
		return nil, fmt.Errorf("cannot create TensorRT runtime")
	}

	engine := C.trtDeserializeEngine(
		rt,
		unsafe.Pointer(&blob[0]),
		C.size_t(len(blob)),
	)
	if engine == nil {
		return nil, fmt.Errorf("cannot deserialize engine")
	}

	ctx := C.trtCreateContext(engine)
	if ctx == nil {
		return nil, fmt.Errorf("cannot create execution context")
	}

	return &Engine{
		Runtime: rt,
		Engine:  engine,
		Ctx:     ctx,
	}, nil
}