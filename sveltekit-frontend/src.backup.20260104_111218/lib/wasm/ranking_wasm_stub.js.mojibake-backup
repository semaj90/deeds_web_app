// ranking_wasm_stub.js
// Placeholder JS module emulating WASM interface so worker can dynamically import it.
// Replace with generated wasm-pack bundle exporting pack_rankings / unpack_rankings.
export default {
  pack_rankings(jsonStr) {
    // naive passthrough: parse then re-pack via JS reference implementation inside worker
    try {
      JSON.parse(jsonStr);
    } catch {
      /* ignore */
    }
    return new Uint8Array(); // worker will fallback if empty
  },
  unpack_rankings(u8arr) {
    // return JSON string; empty implementation
    return JSON.stringify({
      results: [],
      query: '',
      totalResults: 0,
      timestamp: Date.now(),
      version: 1,
    });
  },
};
