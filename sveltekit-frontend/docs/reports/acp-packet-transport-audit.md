# ACP Packet Transport Audit Report

**Date**: 2026-06-23T16:34:40.371Z

## Summary

| Metric | Value |
|--------|-------|
| Total Packets Audited | 17995 |
| Valid | 17931 (99.6%) |
| Invalid | 64 (0.4%) |
| GAN Trigger | 🚨 YES |

## Issues Found

**Count**: 64


Top issues:
```
memory/runs/01cb725b540e/gap_report.json:5812a9c2882a3488: prompt injection risk detected
src/routes/api/document/analysis/[evidenceId]/+server.ts:06757b10a87ca59c: prompt injection risk detected
src/lib/server/reconstruction/scene-intent-extractor.ts:e0686fcc0a660a61: prompt injection risk detected
src/routes/api/admin/ai-chat/summarize-panel/+server.ts:abdf0bc43eb0fae9: prompt injection risk detected
src/routes/api/codebase-index/evidence-analyze/+server.ts:688a6d36668f68a8: prompt injection risk detected
f90bdca555d954ed: prompt injection risk detected
src/lib/server/ai/gemma4-tool-controller.ts:20b173e1342234a4: prompt injection risk detected
src/routes/api/files/[id]/+server.ts:c34e545be8b8a091: prompt injection risk detected
src/routes/api/analytics/deep-research/+server.ts:99eecc030f734d35: prompt injection risk detected
src/routes/api/audio/analysis/[evidenceId]/+server.ts:66ede84436f3aec1: prompt injection risk detected
```


## High-Risk Samples


**Prompt Injection Risk**:
```json
[
  {
    "packet_id": "069cbf0c-e30d-4368-94d3-ad23d08f3034",
    "packet_key": "memory/runs/01cb725b540e/gap_report.json:5812a9c2882a3488",
    "checks": {
      "hex_packet_key_valid": true,
      "packet_key_length_valid": true,
      "utf8_decode_safe": true,
      "json_payload_valid": false,
      "jsonrpc_shape_valid": false,
      "method_allowlisted": true,
      "canonical_fields_present": true,
      "cache_namespace_valid": true,
      "traversal_path_array": true,
      "prompt_injection_risk": true
    },
    "gan_trigger": true,
    "issues": [
      "prompt injection risk detected"
    ]
  },
  {
    "packet_id": "0ca9319c-ced3-4fa8-bdf4-05ca30753bba",
    "packet_key": "src/routes/api/document/analysis/[evidenceId]/+server.ts:06757b10a87ca59c",
    "checks": {
      "hex_packet_key_valid": true,
      "packet_key_length_valid": true,
      "utf8_decode_safe": true,
      "json_payload_valid": false,
      "jsonrpc_shape_valid": false,
      "method_allowlisted": true,
      "canonical_fields_present": true,
      "cache_namespace_valid": true,
      "traversal_path_array": true,
      "prompt_injection_risk": true
    },
    "gan_trigger": true,
    "issues": [
      "prompt injection risk detected"
    ]
  },
  {
    "packet_id": "10776a5b-2ce7-42a6-a281-f6abdf622cf1",
    "packet_key": "src/lib/server/reconstruction/scene-intent-extractor.ts:e0686fcc0a660a61",
    "checks": {
      "hex_packet_key_valid": true,
      "packet_key_length_valid": true,
      "utf8_decode_safe": true,
      "json_payload_valid": false,
      "jsonrpc_shape_valid": false,
      "method_allowlisted": true,
      "canonical_fields_present": true,
      "cache_namespace_valid": true,
      "traversal_path_array": true,
      "prompt_injection_risk": true
    },
    "gan_trigger": true,
    "issues": [
      "prompt injection risk detected"
    ]
  }
]
```


## Valid Sample

```json
{
  "packet_id": "0002ca90-38b7-428b-93ae-4e6eaa3d8aaa",
  "packet_key": "5ee867f78c3ad62b",
  "checks": {
    "hex_packet_key_valid": true,
    "packet_key_length_valid": true,
    "utf8_decode_safe": true,
    "json_payload_valid": false,
    "jsonrpc_shape_valid": false,
    "method_allowlisted": true,
    "canonical_fields_present": true,
    "cache_namespace_valid": true,
    "traversal_path_array": true,
    "prompt_injection_risk": false
  },
  "gan_trigger": false,
  "issues": []
}
```

## Recommendation


🚨 **GAN Validation Required**

Before proceeding with P3g embedding backfill:
```bash
npm run atlas:rpc-validation-gan
```

Review 64 structural issues and high-risk packets.

