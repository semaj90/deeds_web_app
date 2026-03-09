#!/usr/bin/env python3
import subprocess, sys, re, time, psutil, shutil, json, os
from datetime import datetime, timezone
from rich.console import Console
from rich.progress import (
    Progress, TextColumn, BarColumn, TimeRemainingColumn, TimeElapsedColumn,
    SpinnerColumn
)
from rich.panel import Panel
from rich.live import Live

# Set LD_LIBRARY_PATH for TensorRT
os.environ['LD_LIBRARY_PATH'] = '/usr/local/tensorrt/targets/x86_64-linux-gnu/lib:' + os.environ.get('LD_LIBRARY_PATH', '')

console = Console()
log_file = "/model/weights/engine/build.log"
bench_file = "/model/weights/engine/benchmark.json"  ### NEW
GPU_POLL_INTERVAL = 0.5  # seconds

# Detect stages
patterns = {
    "Loading weights": r"(Loading|Reading).*weight",
    "Building plugins": r"plugin",
    "Compiling kernels": r"(kernel|gemm|attention)",
    "Optimizing graph": r"(fusion|graph|optimiz)",
    "Serializing engine": r"(serialize|engine build)",
    "Saving engine": r"(saved|writing|complete)",
}

# Track FLOPS from logs
tflops_detect = re.compile(r"(\d+\.?\d*)\s*(TFLOP|GFLOP|TOPS)", re.IGNORECASE)
flops_value = None
peak_vram = 0  ### NEW: peak VRAM tracking

# Open log
log = open(log_file, "w")

def detect_versions():
    try:
        trtllm = subprocess.check_output(["trtllm-build", "--version"], encoding="utf-8").strip()
    except:
        trtllm = "unknown"
    try:
        cuda = subprocess.check_output(["nvcc", "--version"], encoding="utf-8")
        cuda = re.search(r"release\s+(\d+\.\d+)", cuda).group(1)
    except:
        cuda = "unknown"
    return trtllm, cuda

def detect_stage(line):
    for name, pat in patterns.items():
        if re.search(pat, line, re.IGNORECASE):
            return name
    return None

def get_gpu_stats():
    try:
        smi = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.used,utilization.gpu",
             "--format=csv,noheader,nounits"],
            encoding="utf-8"
        ).strip()
        name, total, used, util = smi.split(",")
        return name.strip(), int(total), int(used), int(util)
    except Exception:
        return None, None, None, None

def gpu_panel():
    global peak_vram
    name, total, used, util = get_gpu_stats()
    if total is None:
        return Panel("GPU info unavailable")

    # Track peak VRAM
    if used > peak_vram:
        peak_vram = used

    bar_len = 20
    pct = int(used * 100 / total)
    filled = int((pct/100) * bar_len)
    bar = "█" * filled + "░" * (bar_len - filled)
    title = f"[bold cyan]GPU VRAM[/bold cyan] {used}/{total} MiB ({pct}%)"
    return Panel(f"{bar}\n[bold green]Utilization:[/bold green] {util}%", title=title)

def flops_panel():
    if not flops_value:
        return Panel("[yellow]Collecting kernel performance…[/yellow]", title="TFLOPS")
    return Panel(f"[bold magenta]{flops_value}[/bold magenta]", title="Kernel TFLOPS")

### NEW: Save benchmark JSON
def save_benchmark(elapsed_sec):
    trtllm_ver, cuda_ver = detect_versions()
    name, total, used, util = get_gpu_stats()
    data = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "build_time_sec": round(elapsed_sec, 2),
        "peak_vram_mb": peak_vram,
        "gpu": {
            "name": name,
            "total_vram_mb": total
        },
        "max_tflops": flops_value,
        "framework": {
            "tensorrt_llm": trtllm_ver,
            "cuda": cuda_ver
        }
    }
    with open(bench_file, "w") as f:
        json.dump(data, f, indent=2)
    console.print(Panel.fit(f"[bold green]📊 Benchmark saved![/bold green]\n{bench_file}"))

### 🏁 UI + BUILD
start_time = time.time()

with Progress(
    SpinnerColumn(),
    TextColumn("[bold cyan]{task.description}"),
    BarColumn(),
    TimeRemainingColumn(),
    TimeElapsedColumn(),
    console=console,
) as progress:
    task = progress.add_task("Starting…", total=len(patterns))
    seen = set()

    process = subprocess.Popen(
        sys.argv[1:], text=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1
    )

    while True:
        line = process.stdout.readline()
        if not line:
            break
        line_str = line.strip()
        log.write(line)

        # detect stage
        stage = detect_stage(line_str)
        if stage and stage not in seen:
            seen.add(stage)
            progress.update(task, description=f"[bold green]{stage}")
            progress.advance(task)

        # detect TFLOPS
        fl = tflops_detect.search(line_str)
        if fl:
            val, unit = fl.groups()
            flops_value = f"{val} {unit.upper()}"

        # styled logs
        if "error" in line_str.lower():
            console.print(Panel(line_str, style="bold red"))
        elif "warning" in line_str.lower():
            console.print(f"[yellow]{line_str}")
        else:
            console.print(line_str)

        # GPU stats rendering
        console.print(gpu_panel())
        console.print(flops_panel())

    process.wait()

log.close()

end_time = time.time()
elapsed = end_time - start_time
save_benchmark(elapsed)  ### NEW: save metrics

console.print(Panel.fit("[bold green]🚀 Engine build finished successfully![/bold green]"))
console.print(f"[bold cyan]📁 Logs saved:[/bold cyan] {log_file}")
