import hashlib
import json
import re
import requests

HEADROOM_URL = "http://127.0.0.1:8787"

# 1. Code-aware TypeScript function-card fixture
FIXTURE_CODE = "\n".join(
    [
        f"""export function computeAtlasScore_{i}(candidateId: string, dense: number, sparse: number): {{ id: string; score: number; tier: string }} {{
  const weighted = dense * 0.65 + sparse * 0.35 + {i * 0.001:.4f};
  const tier = weighted > 0.8 ? 'HOT' : weighted > 0.5 ? 'WARM' : 'COLD';
  if (weighted < 0) {{
    throw new Error('INVALID_NEGATIVE_SCORE');
  }}
  return {{ id: candidateId, score: Number(weighted.toFixed(6)), tier }};
}}"""
        for i in range(1, 45)
    ]
)

# 2. JSON array of scalar strings (triggers SmartCrusher lossy row-drop + <<ccr:HASH N_items_offloaded>> marker)
FIXTURE_JSON_CARDS = json.dumps(
    [
        f"fn_card_record_{i:03d}: symbol:src/lib/atlas/ranker.ts:score | status=eligible | note=" + ("a" * 120)
        for i in range(1, 100)
    ]
)

CODE_SHA256 = hashlib.sha256(FIXTURE_CODE.encode("utf-8")).hexdigest()
JSON_SHA256 = hashlib.sha256(FIXTURE_JSON_CARDS.encode("utf-8")).hexdigest()

payload = {
    "model": "ornith-1.5-9b",
    "config": {"mode": "ccr"},
    "messages": [
        {"role": "system", "content": "You are a code analysis assistant."},
        {
            "role": "user",
            "content": "Inspect the function cards and JSON metadata below.",
        },
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "call_code_01",
                    "type": "function",
                    "function": {
                        "name": "read_function_code",
                        "arguments": json.dumps({"path": "src/lib/fixture-cards.ts"}),
                    },
                },
                {
                    "id": "call_json_02",
                    "type": "function",
                    "function": {
                        "name": "list_function_cards",
                        "arguments": json.dumps({"limit": 120}),
                    },
                },
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call_code_01",
            "name": "read_function_code",
            "content": FIXTURE_CODE,
        },
        {
            "role": "tool",
            "tool_call_id": "call_json_02",
            "name": "list_function_cards",
            "content": FIXTURE_JSON_CARDS,
        },
        {
            "role": "assistant",
            "content": "I have reviewed the initial batch of function cards.",
        },
        {
            "role": "user",
            "content": "Now summarize the top scoring function cards and their weights.",
        },
    ],
}

res = requests.post(f"{HEADROOM_URL}/v1/compress", json=payload, timeout=15)
data = res.json()

compressed_msgs = data.get("messages", [])
tool_msgs = [m for m in compressed_msgs if m.get("role") == "tool"]
ccr_hashes = list(data.get("ccr_hashes", []))

# Also scan compressed tool content for <<ccr:HASH...>> markers
for tm in tool_msgs:
    content_str = str(tm.get("content", ""))
    for m in re.finditer(r"<<ccr:([0-9a-f]+)", content_str):
        if m.group(1) not in ccr_hashes:
            ccr_hashes.append(m.group(1))

retrieved_entries = []
for h in ccr_hashes:
    r_item = requests.get(f"{HEADROOM_URL}/v1/retrieve/{h}", timeout=5)
    if r_item.status_code == 200:
        item_json = r_item.json()
        orig_content = item_json.get("original_content", "")
        recovered_sha256 = hashlib.sha256(str(orig_content).encode("utf-8")).hexdigest()
        json_semantic_equal = False
        try:
            json_semantic_equal = json.loads(str(orig_content)) == json.loads(FIXTURE_JSON_CARDS)
        except Exception:
            json_semantic_equal = False
        retrieved_entries.append(
            {
                "hash": h,
                "status": r_item.status_code,
                "recoveredBytes": len(str(orig_content).encode("utf-8")),
                "recoveredSha256": recovered_sha256,
                "exactCodeChecksumMatch": recovered_sha256 == CODE_SHA256,
                "exactJsonRawByteChecksumMatch": recovered_sha256 == JSON_SHA256,
                "jsonSemanticArrayEqual": json_semantic_equal,
                "originalTokens": item_json.get("original_tokens"),
                "compressedItemCount": item_json.get("compressed_item_count"),
                "originalItemCount": item_json.get("original_item_count"),
            }
        )

stats_res = requests.get(f"{HEADROOM_URL}/v1/retrieve/stats", timeout=5).json()

summary = {
    "canonicalAuthority": False,
    "replacementCanonicalEvidence": False,
    "tokensBefore": data.get("tokens_before"),
    "tokensAfter": data.get("tokens_after"),
    "tokensSaved": data.get("tokens_saved"),
    "compressionRatio": data.get("compression_ratio"),
    "transformsApplied": data.get("transforms_applied"),
    "ccrHashes": ccr_hashes,
    "ccrRetrieved": retrieved_entries,
    "ccrStoreEntryCount": stats_res.get("store", {}).get("entry_count"),
    "codeToolCompressedPreview": str(tool_msgs[0].get("content", ""))[:220] if len(tool_msgs) > 0 else "",
    "jsonToolItemsSample": json.loads(tool_msgs[1].get("content", "[]")) if len(tool_msgs) > 1 else [],
    "codeOriginalSha256": CODE_SHA256,
    "jsonOriginalSha256": JSON_SHA256,
}
print(json.dumps(summary, indent=2))
