#!/usr/bin/env python3
"""
CUDA Graph Optimizer for Q4_K_M TensorRT Engines
Pre-captures execution graphs for repeated inference optimization
"""

import os
import sys
import time
import json
import numpy as np
import tensorrt as trt
import pycuda.driver as cuda
import pycuda.autoinit
from typing import Dict, List, Optional, Tuple, Any
import argparse
from pathlib import Path
import torch

# TensorRT logger
TRT_LOGGER = trt.Logger(trt.Logger.INFO)

class CUDAGraphOptimizer:
    """Optimizes TensorRT engines with CUDA graphs for repeated inference"""

    def __init__(self,
                 engine_path: str,
                 max_batch_sizes: List[int] = [1, 4, 8, 16],
                 max_seq_lengths: List[int] = [128, 512, 1024, 2048, 4096]):

        self.engine_path = Path(engine_path)
        self.max_batch_sizes = max_batch_sizes
        self.max_seq_lengths = max_seq_lengths

        # Load TensorRT engine
        self.runtime = trt.Runtime(TRT_LOGGER)
        self.engine = self._load_engine()

        # CUDA context and streams
        self.cuda_context = cuda.Device(0).make_context()
        self.cuda_streams = [cuda.Stream() for _ in range(4)]

        # Pre-captured graphs for different input shapes
        self.captured_graphs = {}
        self.graph_executables = {}

        # Performance metrics
        self.metrics = {
            'capture_times': {},
            'inference_times': {},
            'memory_usage': {},
            'throughput': {}
        }

    def _load_engine(self) -> trt.ICudaEngine:
        """Load TensorRT engine from file"""
        print(f"Loading TensorRT engine from {self.engine_path}")

        if not self.engine_path.exists():
            raise FileNotFoundError(f"Engine file not found: {self.engine_path}")

        with open(self.engine_path, 'rb') as f:
            engine_data = f.read()

        engine = self.runtime.deserialize_cuda_engine(engine_data)
        if not engine:
            raise RuntimeError("Failed to deserialize TensorRT engine")

        print(f"Engine loaded successfully")
        print(f"  - Inputs: {engine.num_bindings // 2}")
        print(f"  - Outputs: {engine.num_bindings // 2}")
        print(f"  - Max batch size: {engine.max_batch_size}")

        return engine

    def capture_cuda_graphs(self) -> Dict[str, Any]:
        """Capture CUDA graphs for different input configurations"""

        print("Capturing CUDA graphs for different configurations...")

        for batch_size in self.max_batch_sizes:
            for seq_len in self.max_seq_lengths:
                config_key = f"b{batch_size}_s{seq_len}"

                print(f"  Capturing graph for batch={batch_size}, seq_len={seq_len}")

                start_time = time.perf_counter()
                graph_exec = self._capture_single_graph(batch_size, seq_len)
                capture_time = time.perf_counter() - start_time

                if graph_exec:
                    self.graph_executables[config_key] = graph_exec
                    self.metrics['capture_times'][config_key] = capture_time
                    print(f"    Captured in {capture_time:.3f}s")
                else:
                    print(f"    Failed to capture graph")

        print(f"Successfully captured {len(self.graph_executables)} CUDA graphs")
        return self.graph_executables

    def _capture_single_graph(self,
                             batch_size: int,
                             seq_len: int) -> Optional[cuda.GraphExec]:
        """Capture a single CUDA graph for specific batch size and sequence length"""

        try:
            # Create execution context
            context = self.engine.create_execution_context()

            # Set dynamic shapes if needed
            if self.engine.has_implicit_batch_dimension:
                context.set_binding_shape(0, (batch_size, seq_len))
            else:
                for i in range(self.engine.num_bindings):
                    if self.engine.binding_is_input(i):
                        shape = self.engine.get_binding_shape(i)
                        shape = tuple(batch_size if dim == -1 else
                                     seq_len if dim == -1 else dim
                                     for dim in shape)
                        context.set_binding_shape(i, shape)

            # Allocate device memory
            bindings, d_inputs, d_outputs = self._allocate_memory(context, batch_size, seq_len)

            # Create a dedicated stream for graph capture
            capture_stream = cuda.Stream()

            # Warm-up execution
            for _ in range(3):
                context.execute_async_v2(bindings, capture_stream.handle)
                capture_stream.synchronize()

            # Begin CUDA graph capture
            graph = cuda.Graph()
            capture_stream.begin_capture()

            # Execute the model within the capture
            success = context.execute_async_v2(bindings, capture_stream.handle)
            if not success:
                capture_stream.end_capture_on_exception()
                return None

            # End capture and create executable graph
            capture_stream.end_capture(graph)
            graph_exec = graph.instantiate()

            # Store memory bindings with the executable
            graph_exec.bindings = bindings
            graph_exec.d_inputs = d_inputs
            graph_exec.d_outputs = d_outputs
            graph_exec.context = context

            return graph_exec

        except Exception as e:
            print(f"    Error capturing graph: {e}")
            return None

    def _allocate_memory(self,
                        context: trt.IExecutionContext,
                        batch_size: int,
                        seq_len: int) -> Tuple[List[int], Dict, Dict]:
        """Allocate device memory for inputs and outputs"""

        bindings = []
        d_inputs = {}
        d_outputs = {}

        for i in range(self.engine.num_bindings):
            binding_name = self.engine.get_binding_name(i)
            shape = context.get_binding_shape(i)
            dtype = trt.nptype(self.engine.get_binding_dtype(i))

            # Calculate size
            size = trt.volume(shape) * np.dtype(dtype).itemsize

            # Allocate device memory
            d_mem = cuda.mem_alloc(size)
            bindings.append(int(d_mem))

            if self.engine.binding_is_input(i):
                d_inputs[binding_name] = {
                    'ptr': d_mem,
                    'shape': shape,
                    'dtype': dtype,
                    'size': size
                }
            else:
                d_outputs[binding_name] = {
                    'ptr': d_mem,
                    'shape': shape,
                    'dtype': dtype,
                    'size': size
                }

        return bindings, d_inputs, d_outputs

    def benchmark_performance(self) -> Dict[str, Any]:
        """Benchmark performance of captured graphs vs standard inference"""

        print("Benchmarking CUDA graph performance...")

        results = {
            'standard_inference': {},
            'cuda_graph_inference': {},
            'speedup_ratios': {}
        }

        num_iterations = 100
        warmup_iterations = 10

        for config_key, graph_exec in self.graph_executables.items():
            batch_size, seq_len = self._parse_config_key(config_key)

            print(f"  Benchmarking {config_key}...")

            # Create test input data
            h_input = self._create_test_input(batch_size, seq_len)

            # Benchmark standard inference
            std_time = self._benchmark_standard_inference(
                h_input, batch_size, seq_len,
                num_iterations, warmup_iterations
            )
            results['standard_inference'][config_key] = std_time

            # Benchmark CUDA graph inference
            graph_time = self._benchmark_graph_inference(
                graph_exec, h_input,
                num_iterations, warmup_iterations
            )
            results['cuda_graph_inference'][config_key] = graph_time

            # Calculate speedup
            speedup = std_time / graph_time if graph_time > 0 else 0
            results['speedup_ratios'][config_key] = speedup

            print(f"    Standard: {std_time:.3f}ms")
            print(f"    CUDA Graph: {graph_time:.3f}ms")
            print(f"    Speedup: {speedup:.2f}x")

        return results

    def _create_test_input(self, batch_size: int, seq_len: int) -> np.ndarray:
        """Create test input data"""

        # Generate random token IDs
        h_input = np.random.randint(
            0, 50000,  # Vocabulary size
            size=(batch_size, seq_len),
            dtype=np.int32
        )
        return h_input

    def _benchmark_standard_inference(self,
                                    h_input: np.ndarray,
                                    batch_size: int,
                                    seq_len: int,
                                    num_iterations: int,
                                    warmup_iterations: int) -> float:
        """Benchmark standard TensorRT inference"""

        context = self.engine.create_execution_context()
        stream = self.cuda_streams[0]

        # Set dynamic shapes
        if not self.engine.has_implicit_batch_dimension:
            context.set_binding_shape(0, (batch_size, seq_len))

        # Allocate memory
        bindings, d_inputs, d_outputs = self._allocate_memory(context, batch_size, seq_len)

        # Copy input to device
        input_name = list(d_inputs.keys())[0]
        cuda.memcpy_htod_async(d_inputs[input_name]['ptr'], h_input, stream)

        # Warm-up
        for _ in range(warmup_iterations):
            context.execute_async_v2(bindings, stream.handle)
            stream.synchronize()

        # Benchmark
        start_time = time.perf_counter()
        for _ in range(num_iterations):
            context.execute_async_v2(bindings, stream.handle)
            stream.synchronize()
        end_time = time.perf_counter()

        avg_time_ms = (end_time - start_time) * 1000 / num_iterations
        return avg_time_ms

    def _benchmark_graph_inference(self,
                                  graph_exec: cuda.GraphExec,
                                  h_input: np.ndarray,
                                  num_iterations: int,
                                  warmup_iterations: int) -> float:
        """Benchmark CUDA graph inference"""

        stream = self.cuda_streams[1]

        # Copy input to device
        input_name = list(graph_exec.d_inputs.keys())[0]
        cuda.memcpy_htod_async(graph_exec.d_inputs[input_name]['ptr'], h_input, stream)

        # Warm-up
        for _ in range(warmup_iterations):
            graph_exec.launch(stream)
            stream.synchronize()

        # Benchmark
        start_time = time.perf_counter()
        for _ in range(num_iterations):
            graph_exec.launch(stream)
            stream.synchronize()
        end_time = time.perf_counter()

        avg_time_ms = (end_time - start_time) * 1000 / num_iterations
        return avg_time_ms

    def _parse_config_key(self, config_key: str) -> Tuple[int, int]:
        """Parse configuration key to extract batch size and sequence length"""
        parts = config_key.split('_')
        batch_size = int(parts[0][1:])  # Remove 'b' prefix
        seq_len = int(parts[1][1:])     # Remove 's' prefix
        return batch_size, seq_len

    def measure_memory_usage(self) -> Dict[str, int]:
        """Measure GPU memory usage for different configurations"""

        print("Measuring GPU memory usage...")

        # Get baseline memory usage
        cuda.mem_get_info()
        free_mem_baseline, total_mem = cuda.mem_get_info()

        memory_usage = {}

        for config_key, graph_exec in self.graph_executables.items():
            batch_size, seq_len = self._parse_config_key(config_key)

            # Calculate theoretical memory usage
            total_input_size = 0
            total_output_size = 0

            for input_info in graph_exec.d_inputs.values():
                total_input_size += input_info['size']

            for output_info in graph_exec.d_outputs.values():
                total_output_size += output_info['size']

            total_size_mb = (total_input_size + total_output_size) / (1024 * 1024)
            memory_usage[config_key] = {
                'input_size_mb': total_input_size / (1024 * 1024),
                'output_size_mb': total_output_size / (1024 * 1024),
                'total_size_mb': total_size_mb
            }

        return memory_usage

    def optimize_execution_order(self) -> List[str]:
        """Optimize execution order for batched inference"""

        print("Optimizing execution order...")

        # Sort configurations by memory usage (ascending)
        config_keys = list(self.graph_executables.keys())
        memory_usage = self.measure_memory_usage()

        sorted_configs = sorted(
            config_keys,
            key=lambda k: memory_usage[k]['total_size_mb']
        )

        print("Optimized execution order (by memory usage):")
        for i, config in enumerate(sorted_configs):
            mem_mb = memory_usage[config]['total_size_mb']
            print(f"  {i+1}. {config}: {mem_mb:.1f} MB")

        return sorted_configs

    def save_optimization_results(self, output_path: str):
        """Save optimization results and captured graphs"""

        output_path = Path(output_path)
        output_path.mkdir(parents=True, exist_ok=True)

        # Save performance metrics
        metrics_path = output_path / "cuda_graph_metrics.json"
        with open(metrics_path, 'w') as f:
            json.dump(self.metrics, f, indent=2)

        # Save memory usage
        memory_usage = self.measure_memory_usage()
        memory_path = output_path / "memory_usage.json"
        with open(memory_path, 'w') as f:
            json.dump(memory_usage, f, indent=2)

        # Save optimization summary
        summary = {
            'engine_path': str(self.engine_path),
            'num_captured_graphs': len(self.graph_executables),
            'configurations': list(self.graph_executables.keys()),
            'total_memory_usage_mb': sum(
                info['total_size_mb'] for info in memory_usage.values()
            ),
            'optimization_timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
        }

        summary_path = output_path / "optimization_summary.json"
        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)

        print(f"Optimization results saved to {output_path}")

    def create_inference_wrapper(self, output_path: str):
        """Create a high-level inference wrapper that uses optimal graphs"""

        wrapper_code = f'''#!/usr/bin/env python3
"""
Optimized Q4_K_M Inference Wrapper with CUDA Graphs
Auto-generated by CUDA Graph Optimizer
"""

import os
import numpy as np
import tensorrt as trt
import pycuda.driver as cuda
import pycuda.autoinit
from typing import Optional, Union, List
import time

class OptimizedQ4KMInference:
    """High-performance inference wrapper using pre-captured CUDA graphs"""

    def __init__(self, engine_path: str):
        self.engine_path = engine_path
        self.runtime = trt.Runtime(trt.Logger(trt.Logger.WARNING))

        # Load engine
        with open(engine_path, 'rb') as f:
            engine_data = f.read()
        self.engine = self.runtime.deserialize_cuda_engine(engine_data)

        # Pre-captured graphs (would be loaded from serialized data)
        self.graph_executables = {{}}
        self.optimal_configs = {list(self.graph_executables.keys())}

        # CUDA streams
        self.streams = [cuda.Stream() for _ in range(2)]

    def infer(self,
              input_ids: np.ndarray,
              use_cuda_graph: bool = True) -> np.ndarray:
        """Run optimized inference"""

        batch_size, seq_len = input_ids.shape
        config_key = f"b{{batch_size}}_s{{seq_len}}"

        if use_cuda_graph and config_key in self.graph_executables:
            return self._infer_with_cuda_graph(input_ids, config_key)
        else:
            return self._infer_standard(input_ids)

    def _infer_with_cuda_graph(self,
                              input_ids: np.ndarray,
                              config_key: str) -> np.ndarray:
        """Fast inference using pre-captured CUDA graph"""

        graph_exec = self.graph_executables[config_key]
        stream = self.streams[0]

        # Copy input
        input_name = list(graph_exec.d_inputs.keys())[0]
        cuda.memcpy_htod_async(
            graph_exec.d_inputs[input_name]['ptr'],
            input_ids,
            stream
        )

        # Launch graph
        graph_exec.launch(stream)

        # Copy output
        output_name = list(graph_exec.d_outputs.keys())[0]
        output_info = graph_exec.d_outputs[output_name]
        h_output = np.empty(output_info['shape'], dtype=output_info['dtype'])

        cuda.memcpy_dtoh_async(h_output, output_info['ptr'], stream)
        stream.synchronize()

        return h_output

    def _infer_standard(self, input_ids: np.ndarray) -> np.ndarray:
        """Standard TensorRT inference"""

        context = self.engine.create_execution_context()
        stream = self.streams[1]

        # Set shapes and allocate memory
        batch_size, seq_len = input_ids.shape
        context.set_binding_shape(0, (batch_size, seq_len))

        # ... (standard inference implementation)

        return np.array([])  # Placeholder

    def get_optimal_batch_size(self, seq_len: int) -> int:
        """Get optimal batch size for given sequence length"""

        # Find largest supported batch size for this seq_len
        for batch_size in [16, 8, 4, 1]:
            config_key = f"b{{batch_size}}_s{{seq_len}}"
            if config_key in self.graph_executables:
                return batch_size
        return 1

    def benchmark(self,
                  batch_sizes: List[int] = [1, 4, 8],
                  seq_lens: List[int] = [128, 512, 1024],
                  num_iterations: int = 100) -> dict:
        """Benchmark performance across different configurations"""

        results = {{}}

        for batch_size in batch_sizes:
            for seq_len in seq_lens:
                # Create test input
                input_ids = np.random.randint(
                    0, 50000,
                    size=(batch_size, seq_len),
                    dtype=np.int32
                )

                # Warm-up
                for _ in range(10):
                    self.infer(input_ids)

                # Benchmark
                start_time = time.perf_counter()
                for _ in range(num_iterations):
                    output = self.infer(input_ids)
                end_time = time.perf_counter()

                avg_time_ms = (end_time - start_time) * 1000 / num_iterations
                throughput = batch_size * num_iterations / (end_time - start_time)

                config = f"b{{batch_size}}_s{{seq_len}}"
                results[config] = {{
                    'avg_time_ms': avg_time_ms,
                    'throughput_samples_per_sec': throughput
                }}

        return results

# Usage example
if __name__ == "__main__":
    engine_path = "{self.engine_path}"

    inferencer = OptimizedQ4KMInference(engine_path)

    # Single inference
    input_ids = np.random.randint(0, 50000, size=(1, 512), dtype=np.int32)
    output = inferencer.infer(input_ids)

    # Benchmark
    results = inferencer.benchmark()
    for config, metrics in results.items():
        print(f"{{config}}: {{metrics['avg_time_ms']:.2f}}ms, "
              f"{{metrics['throughput_samples_per_sec']:.1f}} samples/sec")
'''

        wrapper_path = Path(output_path) / "optimized_inference.py"
        with open(wrapper_path, 'w') as f:
            f.write(wrapper_code)

        print(f"Inference wrapper created: {wrapper_path}")

    def cleanup(self):
        """Clean up CUDA resources"""

        for graph_exec in self.graph_executables.values():
            if hasattr(graph_exec, 'd_inputs'):
                for input_info in graph_exec.d_inputs.values():
                    input_info['ptr'].free()
            if hasattr(graph_exec, 'd_outputs'):
                for output_info in graph_exec.d_outputs.values():
                    output_info['ptr'].free()

        for stream in self.cuda_streams:
            del stream

        self.cuda_context.pop()

def main():
    parser = argparse.ArgumentParser(
        description="Optimize TensorRT engines with CUDA graphs"
    )
    parser.add_argument(
        "engine_path",
        type=str,
        help="Path to TensorRT engine file"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./cuda_graph_optimization",
        help="Output directory for optimization results"
    )
    parser.add_argument(
        "--batch-sizes",
        type=int,
        nargs='+',
        default=[1, 4, 8, 16],
        help="Batch sizes to optimize for"
    )
    parser.add_argument(
        "--seq-lengths",
        type=int,
        nargs='+',
        default=[128, 512, 1024, 2048, 4096],
        help="Sequence lengths to optimize for"
    )
    parser.add_argument(
        "--benchmark",
        action='store_true',
        help="Run performance benchmarks"
    )

    args = parser.parse_args()

    # Check CUDA availability
    if not torch.cuda.is_available():
        print("Error: CUDA not available")
        sys.exit(1)

    print(f"CUDA device: {torch.cuda.get_device_name(0)}")
    print(f"GPU memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    # Initialize optimizer
    optimizer = CUDAGraphOptimizer(
        engine_path=args.engine_path,
        max_batch_sizes=args.batch_sizes,
        max_seq_lengths=args.seq_lengths
    )

    try:
        # Capture CUDA graphs
        optimizer.capture_cuda_graphs()

        # Benchmark performance
        if args.benchmark:
            benchmark_results = optimizer.benchmark_performance()
            optimizer.metrics['benchmark_results'] = benchmark_results

        # Optimize execution order
        optimal_order = optimizer.optimize_execution_order()
        optimizer.metrics['optimal_execution_order'] = optimal_order

        # Save results
        optimizer.save_optimization_results(args.output_dir)

        # Create inference wrapper
        optimizer.create_inference_wrapper(args.output_dir)

        print("\nOptimization Summary:")
        print(f"  - Captured graphs: {len(optimizer.graph_executables)}")
        print(f"  - Output directory: {args.output_dir}")

        if args.benchmark:
            avg_speedup = np.mean(list(
                optimizer.metrics['benchmark_results']['speedup_ratios'].values()
            ))
            print(f"  - Average speedup: {avg_speedup:.2f}x")

    except Exception as e:
        print(f"Optimization failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    finally:
        optimizer.cleanup()

if __name__ == "__main__":
    main()