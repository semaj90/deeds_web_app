use napi::bindgen_prelude::*;
use napi_derive::napi;

use napi::bindgen_prelude::AsyncTask;
use napi::{Env, JsObject};
use rayon::prelude::*;
use simd_json::serde as simd_serde;

fn parse_json(input: &str) -> std::result::Result<serde_json::Value, String> {
    let mut simd_buf = input.as_bytes().to_vec();
    match simd_serde::from_slice::<serde_json::Value>(&mut simd_buf) {
        Ok(value) => Ok(value),
        Err(_) => serde_json::from_slice(input.as_bytes())
            .map_err(|error| format!("parse error: {}", error)),
    }
}

#[napi]
fn parse_fast(input: String) -> Result<String> {
    let value = parse_json(&input).map_err(Error::from_reason)?;
    serde_json::to_string(&value)
        .map_err(|error| Error::from_reason(format!("serialize error: {}", error)))
}

#[napi]
fn parse_fast_count(input: String) -> Result<u32> {
    let value = parse_json(&input).map_err(Error::from_reason)?;
    let count = value
        .as_object()
        .map(|object| object.len())
        .or_else(|| value.as_array().map(|array| array.len()))
        .unwrap_or(0);
    u32::try_from(count).map_err(|_| Error::from_reason("JSON item count exceeds u32"))
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
            let value = parse_json(&s)?;
            serde_json::to_string(&value).map_err(|error| format!("serialize error: {}", error))
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
        return Err(Error::from_reason(
            "Input and output arrays must have the same length",
        ));
    }
    let n = input.len() as i32;
    unsafe {
        runSOMCache(input.as_ptr(), output.as_mut_ptr(), n);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{parse_batch_impl, parse_json};

    #[test]
    fn parser_snapshot_preserves_nested_packet_parameters_and_unicode() {
        let parsed = parse_json(
      r#"{"packet_key":"pkt:001","source_ref":"src:α","params":{"top_k":8,"enabled":true},"tags":["cache","ACE"]}"#,
    ).unwrap();

        assert_eq!(
            serde_json::to_string(&parsed).unwrap(),
            r#"{"packet_key":"pkt:001","params":{"enabled":true,"top_k":8},"source_ref":"src:α","tags":["cache","ACE"]}"#,
        );
    }

    #[test]
    fn batch_snapshot_preserves_input_order_and_rejects_malformed_json() {
        let parsed = parse_batch_impl(vec![
            r#"{"ordinal":2}"#.to_string(),
            r#"{"ordinal":1}"#.to_string(),
        ])
        .unwrap();
        assert_eq!(parsed, vec![r#"{"ordinal":2}"#, r#"{"ordinal":1}"#]);

        let error = parse_batch_impl(vec![
            r#"{"ordinal":2}"#.to_string(),
            "{not-json}".to_string(),
        ])
        .unwrap_err();
        assert!(error.starts_with("parse error:"));
    }
}
