use napi::bindgen_prelude::*;
use napi_derive::napi;
use rayon::prelude::*;
use rustc_hash::FxHashSet;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use twox_hash::XxHash64;

// Pulls existing pure Rust TurboVec crate into the N-API bridge.
use turbovec::TurboQuantIndex;

// ── Shared types ──────────────────────────────────────────────────────────────

/// Atlas node as read from JSONL — used by packQdrantPayloads.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtlasNode {
    pub card_id: String,
    pub source_ref: Option<String>,
    pub som_row: Option<i32>,
    pub som_col: Option<i32>,
    pub som_dist: Option<f64>,
    pub tags: Option<Vec<String>>,
    pub keywords: Option<Vec<String>>,
    pub feature_ids: Option<Vec<String>>,
    pub lane_ids: Option<Vec<String>>,
    pub summary: Option<String>,
    pub kind: Option<String>,
    pub area: Option<String>,
}

/// Edge packet — used by dedupeEdges and packQdrantPayloads lane_id join.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgePacket {
    pub src: String,
    pub dst: String,
    #[serde(default)]
    pub r#type: String,
    pub feature_ids: Option<Vec<String>>,
    pub lane_ids: Option<Vec<String>>,
    pub confidence: Option<f32>,
}

/// Qdrant-ready payload — output of packQdrantPayloads.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QdrantPayload {
    pub source_ref: String,
    pub som_cell: Option<String>,
    pub som_row: Option<i32>,
    pub som_col: Option<i32>,
    pub feature_id: Option<String>,
    pub feature_ids: Vec<String>,
    pub lane_ids: Vec<String>,
    pub tags: Vec<String>,
    pub keywords: Vec<String>,
    pub kind: Option<String>,
    pub area: Option<String>,
    pub summary: Option<String>,
}

// ── 1. hashSourceRefs ─────────────────────────────────────────────────────────

/// Hash each source_ref string with XxHash64 (seed 42).
/// Returns a Buffer of raw little-endian u64 bytes (8 bytes per hash).
///
/// JS side:
///   const buf = hashSourceRefs(refs)
///   const ids = new BigUint64Array(buf.buffer, buf.byteOffset, buf.length / 8)
#[napi]
pub fn hash_source_refs(refs: Vec<String>) -> Buffer {
    let mut out = Vec::with_capacity(refs.len() * 8);
    for r in &refs {
        let mut h = XxHash64::with_seed(42);
        r.hash(&mut h);
        out.extend_from_slice(&h.finish().to_le_bytes());
    }
    Buffer::from(out)
}

// ── 2. dedupeEdgesJson ────────────────────────────────────────────────────────

/// Remove duplicate directed edges (same src+dst+type).
/// Input/output: JSON string of EdgePacket[].
#[napi]
pub fn dedupe_edges_json(edges_json: String) -> Result<String> {
    let edges: Vec<EdgePacket> = serde_json::from_str(&edges_json)
        .map_err(|e| Error::from_reason(format!("edge parse error: {e}")))?;

    let mut seen = FxHashSet::default();
    let mut out: Vec<EdgePacket> = Vec::with_capacity(edges.len());

    for e in edges {
        let key = format!("{}|{}|{}", e.src, e.dst, e.r#type);
        let mut h = XxHash64::with_seed(1);
        key.hash(&mut h);
        if seen.insert(h.finish()) {
            out.push(e);
        }
    }

    serde_json::to_string(&out)
        .map_err(|e| Error::from_reason(format!("edge serialize error: {e}")))
}

// ── 3. scoreSom20x20 ──────────────────────────────────────────────────────────

/// Score SOM candidate cells against a query cell using Euclidean distance
/// on a 20×20 grid. Returns Float32Array of scores in (0, 1].
/// 1.0 = same cell. Cell index = row * 20 + col. Uint16 range 0–399.
#[napi]
pub fn score_som20x20(query_cell: u32, candidate_cells: Vec<u32>) -> Result<Float32Array> {
    let qx = (query_cell % 20) as f32;
    let qy = (query_cell / 20) as f32;

    let scores: Vec<f32> = candidate_cells
        .into_par_iter()
        .map(|c| {
            let x = (c % 20) as f32;
            let y = (c / 20) as f32;
            let dist = ((qx - x).powi(2) + (qy - y).powi(2)).sqrt();
            1.0 / (1.0 + dist)
        })
        .collect();

    Ok(Float32Array::from(scores))
}

// ── 4. loadJsonlPackets ───────────────────────────────────────────────────────

/// Read a JSONL file and return the rows as a JSON string.
/// Uses Rayon parallel parse; falls back to serde_json per line.
#[napi]
pub fn load_jsonl_packets(path: String) -> Result<String> {
    let text = fs::read_to_string(&path)
        .map_err(|e| Error::from_reason(format!("read {path}: {e}")))?;

    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();

    let rows: Vec<serde_json::Value> = lines
        .into_par_iter()
        .filter_map(|l| {
            let mut buf = l.as_bytes().to_vec();
            simd_json::serde::from_slice::<serde_json::Value>(&mut buf)
                .ok()
                .or_else(|| serde_json::from_str(l).ok())
        })
        .collect();

    serde_json::to_string(&rows)
        .map_err(|e| Error::from_reason(format!("serialize: {e}")))
}

// ── 5. packQdrantPayloads ─────────────────────────────────────────────────────

/// Read atlas nodes JSONL + edges JSONL, join on source_ref, assemble
/// QdrantPayload structs with lane_ids, feature_ids, SOM coords, and
/// return as MessagePack Buffer ready for direct Qdrant upsert.
///
/// Pure data transformer — never touches Qdrant or any network socket.
#[napi]
pub fn pack_qdrant_payloads(nodes_path: String, edges_path: String) -> Result<Buffer> {
    // Parse nodes
    let nodes_raw = fs::read_to_string(&nodes_path)
        .map_err(|e| Error::from_reason(format!("read nodes {nodes_path}: {e}")))?;

    let node_lines: Vec<&str> = nodes_raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .collect();

    let nodes: Vec<AtlasNode> = node_lines
        .into_par_iter()
        .filter_map(|l| {
            let mut buf = l.as_bytes().to_vec();
            simd_json::serde::from_slice::<AtlasNode>(&mut buf)
                .ok()
                .or_else(|| serde_json::from_str(l).ok())
        })
        .collect();

    // Parse edges — build lane_id index keyed by source_ref
    let edges_raw = fs::read_to_string(&edges_path)
        .map_err(|e| Error::from_reason(format!("read edges {edges_path}: {e}")))?;

    let mut lane_map: HashMap<String, Vec<String>> = HashMap::new();
    for line in edges_raw.lines().filter(|l| !l.trim().is_empty()) {
        let mut buf = line.as_bytes().to_vec();
        let edge: Option<EdgePacket> = simd_json::serde::from_slice::<EdgePacket>(&mut buf)
            .ok()
            .or_else(|| serde_json::from_str(line).ok());

        if let Some(e) = edge {
            if let Some(lanes) = e.lane_ids {
                lane_map.entry(e.src.clone()).or_default().extend(lanes.clone());
                lane_map.entry(e.dst.clone()).or_default().extend(lanes);
            }
        }
    }

    // Build payloads
    let payloads: Vec<QdrantPayload> = nodes
        .into_par_iter()
        .map(|n| {
            let source_ref = n
                .source_ref
                .clone()
                .unwrap_or_else(|| n.card_id.replace("file:", ""));

            let som_cell = match (n.som_row, n.som_col) {
                (Some(r), Some(c)) => Some(format!("{r}:{c}")),
                _ => None,
            };

            let feature_ids = n.feature_ids.unwrap_or_default();
            let feature_id = feature_ids.first().cloned();

            // Prefer edge-derived lane_ids, fall back to node's own lane_ids
            let raw_lanes = lane_map
                .get(&source_ref)
                .cloned()
                .unwrap_or_else(|| n.lane_ids.unwrap_or_default());

            // Dedupe lane_ids preserving insertion order
            let mut seen_lanes: FxHashSet<&str> = FxHashSet::default();
            let lane_ids: Vec<String> = raw_lanes
                .iter()
                .filter(|l| seen_lanes.insert(l.as_str()))
                .cloned()
                .collect();

            QdrantPayload {
                source_ref,
                som_cell,
                som_row: n.som_row,
                som_col: n.som_col,
                feature_id,
                feature_ids,
                lane_ids,
                tags: n.tags.unwrap_or_default(),
                keywords: n.keywords.unwrap_or_default(),
                kind: n.kind,
                area: n.area,
                summary: n.summary,
            }
        })
        .collect();

    let packed = rmp_serde::to_vec_named(&payloads)
        .map_err(|e| Error::from_reason(format!("msgpack: {e}")))?;

    Ok(Buffer::from(packed))
}

// ── 6. turbovecSmoke ─────────────────────────────────────────────────────────

/// Verify the turbovec quantization crate is linked and functional.
/// Builds a TurboQuantIndex with dim float32 vectors at `bits` precision.
#[napi]
pub fn turbovec_smoke(dim: u32, bits: u32) -> Result<String> {
    let mut index = TurboQuantIndex::new(dim as usize, bits as usize);
    let vectors = vec![0.0_f32; dim as usize * 2];
    index.add(&vectors);
    Ok(format!("ok dim={dim} bits={bits}"))
}
