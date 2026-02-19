package cuda

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

func TestFindCudaWorkerPath_EnvOverride(t *testing.T) {
    tmp := "./nonexistent-cuda-worker.exe"
    os.Setenv("CUDA_WORKER_PATH", tmp)
    defer os.Unsetenv("CUDA_WORKER_PATH")

    // file doesn't exist -> should return empty
    p := FindCudaWorkerPath()
    if p != "" {
        t.Fatalf("expected empty path when CUDA_WORKER_PATH points to missing file, got %q", p)
    }
}

func TestRunExternalCudaWorker_InvalidExe(t *testing.T) {
    // Running with no exe should return error
    _, err := RunExternalCudaWorker(nil, "", map[string]string{"job":"x"}, 1*time.Second)
    if err == nil {
        t.Fatalf("expected error when no exePath provided")
    }
}

func TestMarshalRequest(t *testing.T) {
    req := map[string]interface{}{"job_id":"test","type":"embedding","payload":map[string]interface{}{"text":"hello"}}
    b, err := json.Marshal(req)
    if err != nil {
        t.Fatalf("marshal failed: %v", err)
    }
    if len(b) == 0 {
        t.Fatalf("empty marshal result")
    }
}
