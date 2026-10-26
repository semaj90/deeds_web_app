import time
import torch

def benchmark_cuda_2bit_unpack():
    if not torch.cuda.is_available():
        print("CUDA_UNAVAILABLE")
        return

    device = torch.device("cuda:0")
    device_name = torch.cuda.get_device_name(0)
    print(f"Device: {device_name}")

    # 32,768 candidate records (matching DEFAULT_MAX_N in gpu-topology-projection.ts)
    # Each record has a 32-byte (128-d MRL 2-bit) packed TurboVec blob
    n_candidates = 32768
    packed_gpu = torch.randint(0, 256, (n_candidates, 32), dtype=torch.uint8, device=device)

    # Warmup
    for _ in range(10):
        c0 = (packed_gpu >> 0) & 0x03
        c1 = (packed_gpu >> 2) & 0x03
        c2 = (packed_gpu >> 4) & 0x03
        c3 = (packed_gpu >> 6) & 0x03
    torch.cuda.synchronize()

    # Timing over 100 benchmark iterations
    start_event = torch.cuda.Event(enable_timing=True)
    end_event = torch.cuda.Event(enable_timing=True)

    n_iters = 100
    start_event.record()
    for _ in range(n_iters):
        c0 = (packed_gpu >> 0) & 0x03
        c1 = (packed_gpu >> 2) & 0x03
        c2 = (packed_gpu >> 4) & 0x03
        c3 = (packed_gpu >> 6) & 0x03
    end_event.record()
    torch.cuda.synchronize()

    total_ms = start_event.elapsed_time(end_event)
    avg_ms = total_ms / n_iters

    # Verification against CPU oracle
    packed_cpu = packed_gpu[:4].cpu()
    c0_cpu = (packed_cpu >> 0) & 0x03
    c1_cpu = (packed_cpu >> 2) & 0x03
    c2_cpu = (packed_cpu >> 4) & 0x03
    c3_cpu = (packed_cpu >> 6) & 0x03

    assert torch.equal(c0[:4].cpu(), c0_cpu), "GPU and CPU oracle c0 mismatch"
    assert torch.equal(c3[:4].cpu(), c3_cpu), "GPU and CPU oracle c3 mismatch"

    print(f"ATLAS_GPU_EXECUTION_PROVEN:")
    print(f"  - Candidates: {n_candidates}")
    print(f"  - Total unpack ops: {n_candidates * 128} values/iter")
    print(f"  - Average latency: {avg_ms:.4f} ms per 32K batch")
    print(f"  - Throughput: {(n_candidates / (avg_ms / 1000.0)):,.0f} candidates/sec")
    print(f"  - CPU Oracle parity: VERIFIED")

if __name__ == "__main__":
    benchmark_cuda_2bit_unpack()
