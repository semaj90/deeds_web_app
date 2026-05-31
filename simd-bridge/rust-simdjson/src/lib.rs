use napi::bindgen_prelude::*;
use napi_derive::napi;

use rayon::prelude::*;
use simd_json::serde as simd_serde;
use napi::bindgen_prelude::AsyncTask;
use napi::{Env, JsObject};

#[napi]
fn parse_fast(input: String) -> Result<String> {
  // Try simd-json first (zero-copy where possible). If it fails, fall back to serde_json.
  let mut buf = input.into_bytes();
  // Try simd-json serde path first, fallback to serde_json if necessary
  match simd_serde::from_slice::<serde_json::Value>(&mut buf) {
    Ok(v) => match serde_json::to_string(&v) {
      Ok(s) => Ok(s),
      Err(e) => Err(Error::from_reason(format!("serialize error: {}", e)))
    },
    Err(_) => {
      match serde_json::from_slice::<serde_json::Value>(&buf) {
        Ok(v) => match serde_json::to_string(&v) {
          Ok(s) => Ok(s),
          Err(e) => Err(Error::from_reason(format!("serialize fallback error: {}", e)))
        },
        Err(e) => Err(Error::from_reason(format!("parse error: {}", e)))
      }
    }
  }
}

#[napi]
fn parse_fast_count(input: String) -> Result<u32> {
  // Lightweight helper: parse and return number of top-level keys (0 for arrays)
  let mut buf = input.into_bytes();
  match simd_serde::from_slice::<serde_json::Value>(&mut buf) {
    Ok(v) => {
      if v.is_object() {
        Ok(v.as_object().map(|m| m.len() as u32).unwrap_or(0))
      } else if v.is_array() {
        Ok(v.as_array().map(|a| a.len() as u32).unwrap_or(0))
      } else {
        Ok(0)
      }
    }
    Err(_) => {
      match serde_json::from_slice::<serde_json::Value>(&buf) {
        Ok(v) => {
          if v.is_object() {
            Ok(v.as_object().map(|m| m.len() as u32).unwrap_or(0))
          } else if v.is_array() {
            Ok(v.as_array().map(|a| a.len() as u32).unwrap_or(0))
          } else {
            Ok(0)
          }
        }
        Err(e) => Err(Error::from_reason(format!("parse error: {}", e)))
      }
    }
  }
}

#[napi]
fn parse_batch(inputs: Vec<String>) -> Result<Vec<String>> {
  parse_batch_impl(inputs).map_err(|e| Error::from_reason(e))
}

// Internal helper returning Result<Vec<String>, String>
fn parse_batch_impl(inputs: Vec<String>) -> std::result::Result<Vec<String>, String> {
  // Use Rayon parallel iterator mapping to avoid a shared Mutex.
  // Indexed parallel iterators preserve order when collected into a Vec.
  let parsed: Vec<std::result::Result<String, String>> = inputs
    .into_par_iter()
    .map(|s| {
      let mut buf = s.into_bytes();
      match simd_serde::from_slice::<serde_json::Value>(&mut buf) {
        Ok(v) => match serde_json::to_string(&v) {
          Ok(ss) => Ok(ss),
          Err(e) => Err(format!("serialize error: {}", e)),
        },
        Err(_) => match serde_json::from_slice::<serde_json::Value>(&buf) {
          Ok(v) => match serde_json::to_string(&v) {
            Ok(ss) => Ok(ss),
            Err(e) => Err(format!("serialize fallback error: {}", e)),
          },
          Err(e) => Err(format!("parse error: {}", e)),
        },
      }
    })
    .collect();

  // If any entry is an Err, return the first error encountered for deterministic behavior.
  for r in &parsed {
    if let Err(e) = r {
      return Err(e.clone());
    }
  }

  // All Ok — collect strings preserving order.
  let out: Vec<String> = parsed.into_iter().map(|r| r.unwrap()).collect();
  Ok(out)
}

struct ParseBatchTask {
  inputs: Vec<String>,
}

impl Task for ParseBatchTask {
  type Output = Vec<String>;
  type JsValue = JsObject;

  fn compute(&mut self) -> napi::Result<Self::Output> {
    parse_batch_impl(std::mem::take(&mut self.inputs)).map_err(|e| napi::Error::from_reason(e))
  }

  fn resolve(&mut self, env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
    let mut arr = env.create_array_with_length(output.len())?;
    for (i, s) in output.into_iter().enumerate() {
      let js = env.create_string(&s)?;
      arr.set_element(i as u32, js)?;
    }
    Ok(arr)
  }
}

#[napi]
fn parse_batch_async(inputs: Vec<String>) -> AsyncTask<ParseBatchTask> {
  AsyncTask::new(ParseBatchTask { inputs })
}

extern "C" {
  fn runSOMCache(input: *const f32, output: *mut f32, n: i32);
}

#[napi]
fn run_som_cache(input: Float32Array, mut output: Float32Array) -> Result<()> {
  if input.len() != output.len() {
    return Err(Error::from_reason("Input and output arrays must have the same length"));
  }
  let n = input.len() as i32;
  unsafe {
    runSOMCache(input.as_ptr(), output.as_mut_ptr(), n);
  }
  Ok(())
}
