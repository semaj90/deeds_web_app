use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, Write};
use std::path::Path;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct ChunkInfo {
    chunk_path: String,
    row_count: usize,
    byte_size: usize,
}

#[derive(Serialize, Deserialize)]
struct ParserIndex {
    artifact_path: String,
    total_rows: usize,
    chunks: Vec<ChunkInfo>,
}

#[napi]
pub fn parse_large_json_to_msgpack(
    file_path: String,
    output_dir: String,
    chunk_size: u32,
) -> Result<String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(Error::from_reason(format!("Input file not found: {}", file_path)));
    }

    let out_dir_path = Path::new(&output_dir);
    if !out_dir_path.exists() {
        fs::create_dir_all(out_dir_path)
            .map_err(|e| Error::from_reason(format!("Failed to create output directory: {}", e)))?;
    }

    let file = File::open(path)
        .map_err(|e| Error::from_reason(format!("Failed to open input file: {}", e)))?;
    let reader = BufReader::new(file);

    let mut current_chunk_lines = Vec::new();
    let mut chunks = Vec::new();
    let mut total_rows = 0;
    let mut chunk_index = 1;

    // Stream lines
    for line_res in reader.lines() {
        let line = line_res
            .map_err(|e| Error::from_reason(format!("Error reading line: {}", e)))?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Clean JSON array wrappers if present
        let mut cleaned = trimmed.to_string();
        if cleaned.starts_with('[') {
            cleaned = cleaned[1..].to_string();
        }
        if cleaned.ends_with(']') {
            cleaned = cleaned[..cleaned.len() - 1].to_string();
        }
        if cleaned.starts_with(',') {
            cleaned = cleaned[1..].to_string();
        }
        let cleaned_trimmed = cleaned.trim();
        if cleaned_trimmed.is_empty() {
            continue;
        }

        current_chunk_lines.push(cleaned_trimmed.to_string());

        if current_chunk_lines.len() >= chunk_size as usize {
            let chunk_info = process_chunk(&current_chunk_lines, &output_dir, chunk_index)?;
            total_rows += chunk_info.row_count;
            chunks.push(chunk_info);
            chunk_index += 1;
            current_chunk_lines.clear();
        }
    }

    // Process final chunk if there are remaining rows
    if !current_chunk_lines.is_empty() {
        let chunk_info = process_chunk(&current_chunk_lines, &output_dir, chunk_index)?;
        total_rows += chunk_info.row_count;
        chunks.push(chunk_info);
    }

    // Write packet-index.json to memory/manifests/packet-index.json
    let index_dir = Path::new("memory/manifests");
    if !index_dir.exists() {
        fs::create_dir_all(index_dir)
            .map_err(|e| Error::from_reason(format!("Failed to create manifest directory: {}", e)))?;
    }

    let index_manifest = ParserIndex {
        artifact_path: fs::canonicalize(path)
            .unwrap_or_else(|_| path.to_path_buf())
            .to_string_lossy()
            .to_string(),
        total_rows,
        chunks,
    };

    let index_content = serde_json::to_string_pretty(&index_manifest)
        .map_err(|e| Error::from_reason(format!("Failed to serialize manifest: {}", e)))?;

    let index_path = index_dir.join("packet-index.json");
    let mut index_file = File::create(&index_path)
        .map_err(|e| Error::from_reason(format!("Failed to create index file: {}", e)))?;
    index_file
        .write_all(index_content.as_bytes())
        .map_err(|e| Error::from_reason(format!("Failed to write index file: {}", e)))?;

    Ok(index_content)
}

fn process_chunk(
    lines: &[String],
    output_dir: &str,
    chunk_index: usize,
) -> Result<ChunkInfo> {
    // Parse in parallel using Rayon
    let parsed_rows: Vec<serde_json::Value> = lines
        .par_iter()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();

    let row_count = parsed_rows.len();
    if row_count == 0 {
        return Ok(ChunkInfo {
            chunk_path: "".to_string(),
            row_count: 0,
            byte_size: 0,
        });
    }

    // Serialize to MessagePack
    let msgpack_bytes = rmp_serde::to_vec(&parsed_rows)
        .map_err(|e| Error::from_reason(format!("Failed to serialize to MessagePack: {}", e)))?;

    let byte_size = msgpack_bytes.len();
    let chunk_filename = format!("chunk-{:04}.msgpack", chunk_index);
    let chunk_path = Path::new(output_dir).join(&chunk_filename);

    let mut chunk_file = File::create(&chunk_path)
        .map_err(|e| Error::from_reason(format!("Failed to create chunk file: {}", e)))?;
    chunk_file
        .write_all(&msgpack_bytes)
        .map_err(|e| Error::from_reason(format!("Failed to write chunk file: {}", e)))?;

    Ok(ChunkInfo {
        chunk_path: chunk_path.to_string_lossy().to_string(),
        row_count,
        byte_size,
    })
}
