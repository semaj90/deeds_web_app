import fetch from "node-fetch";

/**
 * Calls the Go SIMD parser (AVX2 + CUDA build)
 * @param {string} text JSON or log payload
 * @param {string} endpoint default http://localhost:8095/json
 */
export async function parseSimdJSON(text, endpoint = process.env.SIMD_URL || "http://localhost:8095/json") {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: text
  });
  if (!res.ok) throw new Error(`SIMD parser failed: ${res.status}`);
  return res.json();
}