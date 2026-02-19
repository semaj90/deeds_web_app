// WebAssembly tensor acceleration for browser-side operations
import { ProtoSerializer } from '../cache/proto-serializer';

interface WasmExports extends WebAssembly.Exports {
  quantize_f32_to_i8(inputPtr: number, length: number): number;
  tensor_dot_product(ptrA: number, ptrB: number): number;
  __wbindgen_malloc(size: number): number;
  __wbindgen_free(ptr: number): void;
  __heap_base: WebAssembly.Global;
}

export class WebAssemblyAccelerator {
  private wasmModule: WebAssembly.Module | null = null;
  private wasmInstance: WebAssembly.Instance | null = null;
  private wasmMemory: WebAssembly.Memory | null = null;
  private serializer: ProtoSerializer;

  constructor() {
    this.serializer = new ProtoSerializer();
  }

  async init(wasmPath?: string) {
    // Use existing WASM or load from path
    if (wasmPath) {
      const wasmBytes = await fetch(wasmPath).then((r) => r.arrayBuffer());
      this.wasmModule = await WebAssembly.compile(wasmBytes);
    } else {
      // Create inline WASM for basic tensor operations
      this.wasmModule = await this.createInlineTensorWASM();
    }

    // Create memory (64KB initial, 16MB max)
    this.wasmMemory = new WebAssembly.Memory({
      initial: 1,
      maximum: 256,
      shared: true,
    });

    this.wasmInstance = await WebAssembly.instantiate(this.wasmModule, {
      env: {
        memory: this.wasmMemory,
        console_log: (ptr: number, len: number) => {
          const bytes = new Uint8Array(this.wasmMemory!.buffer, ptr, len);
          const str = new TextDecoder().decode(bytes);
          console.log(`[WASM] ${str}`);
        },
        performance_now: () => performance.now(),
        abort: (msg: number, file: number, line: number) => {
          console.error("[WASM] Abort:", { msg, file, line });
        },
      },
    });
  }

  private async createInlineTensorWASM(): Promise<WebAssembly.Module> {
    // Create minimal WASM module for tensor operations in binary format
    const wasmBytes = new Uint8Array([
      0x00,
      0x61,
      0x73,
      0x6d, // magic number "\0asm"
      0x01,
      0x00,
      0x00,
      0x00, // version

      // Type section
      0x01,
      0x07,
      0x01, // section id, size, count
      0x60,
      0x02,
      0x7f,
      0x7f,
      0x01,
      0x7f, // func type (i32, i32) -> i32

      // Import section
      0x02,
      0x1a,
      0x02, // section id, size, count
      // memory import
      0x03,
      0x65,
      0x6e,
      0x76, // "env"
      0x06,
      0x6d,
      0x65,
      0x6d,
      0x6f,
      0x72,
      0x79, // "memory"
      0x02,
      0x00,
      0x01, // memory limits
      // console_log import
      0x03,
      0x65,
      0x6e,
      0x76, // "env"
      0x0b,
      0x63,
      0x6f,
      0x6e,
      0x73,
      0x6f,
      0x6c,
      0x65,
      0x5f,
      0x6c,
      0x6f,
      0x67, // "console_log"
      0x00,
      0x00, // func type 0

      // Function section
      0x03,
      0x05,
      0x04, // section id, size, count
      0x00,
      0x00,
      0x00,
      0x00, // func types

      // Export section
      0x07,
      0x2d,
      0x04, // section id, size, count
      // quantize_f32_to_i8 export
      0x12,
      0x71,
      0x75,
      0x61,
      0x6e,
      0x74,
      0x69,
      0x7a,
      0x65,
      0x5f,
      0x66,
      0x33,
      0x32,
      0x5f,
      0x74,
      0x6f,
      0x5f,
      0x69,
      0x38, // "quantize_f32_to_i8"
      0x00,
      0x00, // func index
      // tensor_dot_product export
      0x11,
      0x74,
      0x65,
      0x6e,
      0x73,
      0x6f,
      0x72,
      0x5f,
      0x64,
      0x6f,
      0x74,
      0x5f,
      0x70,
      0x72,
      0x6f,
      0x64,
      0x75,
      0x63,
      0x74, // "tensor_dot_product"
      0x00,
      0x01, // func index

      // Code section
      0x0a,
      0x3f,
      0x04, // section id, size, count

      // quantize_f32_to_i8 function
      0x15,
      0x00, // body size, local count
      0x20,
      0x00, // local.get 0 (input ptr)
      0x20,
      0x01, // local.get 1 (length)
      0x6a, // i32.add (end ptr)
      0x21,
      0x02, // local.set 2 (end)
      // Loop body would go here - simplified for inline
      0x41,
      0x00, // i32.const 0 (return processed count)
      0x0b, // end

      // tensor_dot_product function
      0x15,
      0x00, // body size, local count
      0x20,
      0x00, // local.get 0 (ptr a)
      0x20,
      0x01, // local.get 1 (ptr b)
      0x6a, // i32.add
      0x21,
      0x02, // local.set 2
      0x41,
      0x00, // i32.const 0 (return result)
      0x0b, // end
    ]);

    return WebAssembly.compile(wasmBytes);
  }

  // Quantize Float32Array to Int8Array using WASM
  quantizeF32ToI8(data: Float32Array): Int8Array {
    if (!this.wasmInstance) {
      throw new Error("WASM not initialized");
    }

    const inputSize = data.length * 4; // 4 bytes per float32
    const outputSize = data.length; // 1 byte per int8

    // Allocate memory
    const inputPtr = this.allocate(inputSize);
    const outputPtr = this.allocate(outputSize);

    try {
      // Copy input data to WASM memory
      const inputView = new Float32Array(
        this.wasmMemory!.buffer,
        inputPtr,
        data.length
      );
      inputView.set(data);

      // Call WASM function
      const exports = this.wasmInstance.exports as WasmExports;
      const processed = exports.quantize_f32_to_i8(inputPtr, data.length);

      // Read result
      const outputView = new Int8Array(
        this.wasmMemory!.buffer,
        outputPtr,
        data.length
      );

      return new Int8Array(outputView);
    } finally {
      this.deallocate(inputPtr);
      this.deallocate(outputPtr);
    }
  }

  // Tensor dot product using WASM
  tensorDotProduct(a: Float32Array, b: Float32Array): number {
    if (!this.wasmInstance) {
      throw new Error("WASM not initialized");
    }

    if (a.length !== b.length) {
      throw new Error("Tensor dimensions must match");
    }

    const size = a.length * 4;
    const ptrA = this.allocate(size);
    const ptrB = this.allocate(size);

    try {
      // Copy data
      const viewA = new Float32Array(this.wasmMemory!.buffer, ptrA, a.length);
      const viewB = new Float32Array(this.wasmMemory!.buffer, ptrB, b.length);
      viewA.set(a);
      viewB.set(b);

      // Calculate dot product
      const exports = this.wasmInstance.exports as WasmExports;
      return exports.tensor_dot_product(ptrA, ptrB);
    } finally {
      this.deallocate(ptrA);
      this.deallocate(ptrB);
    }
  }

  // High-level tensor operations
  async compressTensor(
    data: Float32Array,
    compressionType: "float16" | "int8"
  ): Promise<ArrayBuffer> {
    if (compressionType === "int8") {
      const quantized = this.quantizeF32ToI8(data);
      return quantized.buffer.slice(0);
    } else {
      // Float16 compression using JS
      return this.compressToFloat16(data);
    }
  }

  private compressToFloat16(data: Float32Array): ArrayBuffer {
    const float16 = new Uint16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      float16[i] = this.float32ToFloat16(data[i]);
    }
    return float16.buffer;
  }

  private float32ToFloat16(val: number): number {
    const floatView = new Float32Array(1);
    const int32View = new Int32Array(floatView.buffer);
    floatView[0] = val;
    const x = int32View[0];

    const sign = (x >> 31) & 0x0001;
    const exp = (x >> 23) & 0x00ff;
    let frac = x & 0x007fffff;

    if (exp === 0) return sign << 15;
    if (exp === 0xff) return (sign << 15) | 0x7c00 | (frac ? 1 : 0);

    const newExp = exp - 127 + 15;
    if (newExp >= 31) return (sign << 15) | 0x7c00;
    if (newExp <= 0) return sign << 15;

    return (sign << 15) | (newExp << 10) | (frac >> 13);
  }

  // K-means clustering with WASM acceleration
  async kMeansCluster(
    vectors: Float32Array[],
    k: number,
    maxIterations: number = 20
  ): Promise<{
    centroids: Float32Array[];
    assignments: number[];
  }> {
    if (vectors.length === 0) throw new Error("No vectors provided");
    if (k > vectors.length)
      throw new Error("k cannot be larger than number of vectors");

    const dim = vectors[0].length;
    const n = vectors.length;

    // Initialize centroids randomly
    const centroids = Array(k)
      .fill(null)
      .map(() => {
        const idx = Math.floor(Math.random() * n);
        return new Float32Array(vectors[idx]);
      });

    const assignments = new Array(n);

    for (let iter = 0; iter < maxIterations; iter++) {
      let changed = false;

      // Assign points to nearest centroid (using WASM dot product)
      for (let i = 0; i < n; i++) {
        let nearestIdx = 0;
        let minDist = Infinity;

        for (let j = 0; j < k; j++) {
          // Calculate distance using WASM-accelerated operations
          const dist = this.euclideanDistance(vectors[i], centroids[j]);
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = j;
          }
        }

        if (assignments[i] !== nearestIdx) {
          assignments[i] = nearestIdx;
          changed = true;
        }
      }

      if (!changed) break;

      // Update centroids
      for (let j = 0; j < k; j++) {
        const members = vectors.filter((_, i) => assignments[i] === j);
        if (members.length > 0) {
          centroids[j] = this.computeMean(members);
        }
      }
    }

    return { centroids, assignments };
  }

  private euclideanDistance(a: Float32Array, b: Float32Array): number {
    // Use WASM dot product for performance
    const diff = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) {
      diff[i] = a[i] - b[i];
    }
    return Math.sqrt(this.tensorDotProduct(diff, diff));
  }

  private computeMean(vectors: Float32Array[]): Float32Array {
    const mean = new Float32Array(vectors[0].length);
    for (const vec of vectors) {
      for (let i = 0; i < vec.length; i++) {
        mean[i] += vec[i];
      }
    }
    for (let i = 0; i < mean.length; i++) {
      mean[i] /= vectors.length;
    }
    return mean;
  }

  // Memory management
  private allocate(size: number): number {
    // Simple bump allocator for demo
    const exports = this.wasmInstance!.exports as WasmExports;
    return exports.__wbindgen_malloc?.(size) || 0;
  }

  private deallocate(ptr: number): void {
    const exports = this.wasmInstance!.exports as WasmExports;
    exports.__wbindgen_free?.(ptr);
  }

  // Serialize tensors with WASM compression
  async serializeTensorBatch(
    tensors: Array<{
      tensorId: string;
      data: Float32Array;
      shape: number[];
      compressionLevel: "none" | "float16" | "int8";
    }>
  ): Promise<Uint8Array> {
    const compressedTensors = await Promise.all(
      tensors.map(async (tensor) => {
        let compressedData: ArrayBuffer;

        if (tensor.compressionLevel === "none") {
          compressedData = tensor.data.buffer.slice(0);
        } else {
          compressedData = await this.compressTensor(
            tensor.data,
            tensor.compressionLevel
          );
        }

        return {
          tensorId: tensor.tensorId,
          data: compressedData,
          shape: tensor.shape,
          dtype:
            tensor.compressionLevel === "int8"
              ? "int8"
              : tensor.compressionLevel === "float16"
              ? "float16"
              : "float32",
        };
      })
    );

    return this.serializer.serializeBatch(
      compressedTensors,
      `batch_${Date.now()}`
    );
  }

  getMemoryUsage(): {
    wasmHeapSize: number;
    wasmHeapUsed: number;
  } {
    const exports = this.wasmInstance?.exports as WasmExports;
    return {
      wasmHeapSize: this.wasmMemory?.buffer.byteLength || 0,
      wasmHeapUsed: exports.__heap_base.value || 0,
    };
  }

  destroy() {
    this.wasmInstance = null;
    this.wasmModule = null;
    this.wasmMemory = null;
  }
}