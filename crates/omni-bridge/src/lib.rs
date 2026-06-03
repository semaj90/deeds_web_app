//! omni-bridge — N-API addon: zero-copy tensor hand-off between Node.js and GPU.
//!
//! Exports (all callable from Node.js):
//!   helloGpu()          → string   "CUDA:<device_name>" or "CPU-only"
//!   cudaDeviceCount()   → number   CUDA device count (0 on CPU-only)
//!   tensorAdd(a, b)     → Float32Array  element-wise GPU add (stub — returns a+b on CPU)
//!
//! Build:
//!   cargo build --release --features cuda   # GPU path
//!   cargo build --release                   # CPU-only fallback (CI-safe)
//!
//! The compiled .node file is loaded by Node.js:
//!   const bridge = require('./omni_bridge.node');
//!   console.log(bridge.helloGpu());

#![allow(clippy::new_without_default)]

use napi::bindgen_prelude::*;
use napi_derive::napi;

// ── GPU device query (CUDA path) ──────────────────────────────────────

#[cfg(feature = "cuda")]
fn cuda_device_name() -> String {
    use cudarc::driver::CudaDevice;
    match CudaDevice::new(0) {
        Ok(dev) => {
            let props = dev.properties().unwrap_or_default();
            format!("CUDA:{}", props.name().unwrap_or("unknown".to_string()))
        }
        Err(e) => format!("CUDA-error:{e}"),
    }
}

#[cfg(not(feature = "cuda"))]
fn cuda_device_name() -> String {
    "CPU-only".to_string()
}

// ── Exported N-API functions ──────────────────────────────────────────

/// Returns "CUDA:<device_name>" when compiled with --features cuda and a GPU
/// is present, or "CPU-only" otherwise. Used as a health-check in the
/// Dockerfile HEALTHCHECK and Omni-Worker startup smoke.
#[napi]
pub fn hello_gpu() -> String {
    cuda_device_name()
}

/// Returns the number of CUDA devices visible to this process.
/// Returns 0 when compiled without the cuda feature or no GPU present.
#[napi]
pub fn cuda_device_count() -> u32 {
    #[cfg(feature = "cuda")]
    {
        use cudarc::driver::result;
        result::device_count().unwrap_or(0) as u32
    }
    #[cfg(not(feature = "cuda"))]
    0
}

/// Element-wise addition of two Float32 buffers.
///
/// GPU path (--features cuda): dispatches to a tch-rs Tensor add on CUDA device 0.
/// CPU path: performs the addition on the CPU — functionally identical, slower
/// for large arrays. Keeps the API stable across build configurations.
#[napi]
pub fn tensor_add(a: Float32Array, b: Float32Array) -> Result<Float32Array> {
    if a.len() != b.len() {
        return Err(Error::new(
            Status::InvalidArg,
            format!("tensor_add: length mismatch {} != {}", a.len(), b.len()),
        ));
    }

    #[cfg(feature = "cuda")]
    {
        use tch::{Device, Kind, Tensor};
        let dev = Device::Cuda(0);
        let ta = Tensor::from_slice(a.as_ref()).to_kind(Kind::Float).to_device(dev);
        let tb = Tensor::from_slice(b.as_ref()).to_kind(Kind::Float).to_device(dev);
        let tc = ta + tb;
        let result_vec: Vec<f32> = tc.into();
        return Ok(result_vec.into());
    }

    #[cfg(not(feature = "cuda"))]
    {
        let result: Vec<f32> = a.iter().zip(b.iter()).map(|(x, y)| x + y).collect();
        Ok(result.into())
    }
}
