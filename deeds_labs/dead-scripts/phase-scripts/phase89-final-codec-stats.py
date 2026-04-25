#!/usr/bin/env python3
"""
Phase 89: Final Codec Stats Report
Analyze all Redis key types and generate comprehensive codec statistics
"""

import sys
import asyncio
import struct
from pathlib import Path
from collections import defaultdict

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).parent))

try:
    import redis.asyncio as redis
except ImportError:
    import aioredis as redis

try:
    import orjson as json
except ImportError:
    import json


async def main():
    print("📊 Phase 89: Final Codec Statistics Report")
    print("=" * 70)

    cache = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)

    try:
        await cache.ping()
        print("✅ Redis connected")
    except Exception as e:
        print(f"❌ Redis connection failed: {e}")
        await cache.aclose()
        return

    # Scan all phase89:* keys
    print("\n📡 Scanning phase89:* keys...")
    all_keys = []
    cursor = 0

    while True:
        cursor, batch = await cache.scan(cursor, match="phase89:*", count=1000)
        all_keys.extend([k.decode('utf-8') if isinstance(k, bytes) else k for k in batch])

        if cursor == 0:
            break

        if len(all_keys) % 5000 == 0:
            print(f"  Scanned {len(all_keys):,} keys...")

    print(f"\n✅ Found {len(all_keys):,} total phase89:* keys")

    # Analyze by namespace
    namespaces = defaultdict(int)
    redis_types = defaultdict(int)
    codecs = defaultdict(int)

    print(f"\n🔍 Analyzing key types and codecs...")

    sample_size = min(500, len(all_keys))
    sample_keys = all_keys[:sample_size]

    for i, key in enumerate(sample_keys):
        try:
            # Parse namespace
            parts = key.split(':')
            if len(parts) >= 2:
                namespace = f"{parts[0]}:{parts[1]}"
                namespaces[namespace] += 1

            # Get Redis type
            key_type = await cache.type(key)
            if isinstance(key_type, bytes):
                key_type = key_type.decode('utf-8')

            redis_types[key_type] += 1

            # Analyze string values
            if key_type == 'string':
                raw_value = await cache.get(key)

                if raw_value and len(raw_value) == 4096:
                    # Likely base64-encoded float32 embedding (4096 chars → 3072 bytes → 768 floats)
                    try:
                        import base64
                        decoded = base64.b64decode(raw_value)
                        if len(decoded) == 3072:
                            # Verify it's float32
                            floats = struct.unpack(f'{len(decoded)//4}f', decoded)
                            if len(floats) == 768 and all(-1.0 <= f <= 1.0 for f in floats[:10]):
                                codecs['base64+float32[768]'] += 1
                            else:
                                codecs['base64+binary'] += 1
                        else:
                            codecs[f'base64+binary[{len(decoded)}]'] += 1
                    except:
                        codecs['unknown'] += 1

                elif raw_value and len(raw_value) < 1000:
                    # Small values, likely JSON or text
                    try:
                        if raw_value.startswith(b'{') or raw_value.startswith(b'['):
                            codecs['json'] += 1
                        else:
                            codecs['text'] += 1
                    except:
                        codecs['unknown'] += 1

                else:
                    codecs['other'] += 1

        except Exception as e:
            codecs['error'] += 1

        if (i + 1) % 100 == 0:
            print(f"  Analyzed {i + 1}/{sample_size} keys...")

    # Print results
    print("\n" + "=" * 70)
    print("📈 NAMESPACE DISTRIBUTION")
    print("=" * 70)

    for ns, count in sorted(namespaces.items(), key=lambda x: x[1], reverse=True):
        percentage = (count / sample_size) * 100
        print(f"  {ns:40} {count:5} ({percentage:5.1f}%)")

    print("\n" + "=" * 70)
    print("🔑 REDIS TYPE DISTRIBUTION")
    print("=" * 70)

    for rtype, count in sorted(redis_types.items(), key=lambda x: x[1], reverse=True):
        percentage = (count / sample_size) * 100
        print(f"  {rtype:20} {count:5} ({percentage:5.1f}%)")

    print("\n" + "=" * 70)
    print("🧬 CODEC DISTRIBUTION (String Values Only)")
    print("=" * 70)

    for codec, count in sorted(codecs.items(), key=lambda x: x[1], reverse=True):
        percentage = (count / redis_types.get('string', 1)) * 100
        print(f"  {codec:40} {count:5} ({percentage:5.1f}%)")

    # Save stats
    stats = {
        'total_keys': len(all_keys),
        'analyzed_keys': sample_size,
        'namespaces': dict(namespaces),
        'redis_types': dict(redis_types),
        'codecs': dict(codecs)
    }

    stats_file = Path("reports/phase89_final_codec_stats.json")
    stats_file.parent.mkdir(parents=True, exist_ok=True)

    if hasattr(json, 'dumps'):
        if 'orjson' in str(type(json)):
            import orjson
            stats_file.write_bytes(orjson.dumps(stats, option=orjson.OPT_INDENT_2))
        else:
            stats_file.write_text(json.dumps(stats, indent=2))
    else:
        import json as json_stdlib
        stats_file.write_text(json_stdlib.dumps(stats, indent=2))

    print(f"\n💾 Saved stats: {stats_file}")

    # Key findings
    print("\n" + "=" * 70)
    print("🔍 KEY FINDINGS")
    print("=" * 70)

    float_embeddings = codecs.get('base64+float32[768]', 0)
    total_strings = redis_types.get('string', 1)

    if float_embeddings > 0:
        print(f"\n✅ Discovered: {float_embeddings} base64-encoded float32[768] embeddings")
        print(f"   This is {(float_embeddings/total_strings)*100:.1f}% of all string values")
        print(f"\n💡 These are embeddinggemma:latest vectors:")
        print(f"   - Raw: 4096 chars (base64)")
        print(f"   - Decoded: 3072 bytes")
        print(f"   - Floats: 768 dimensions (768 * 4 bytes)")
        print(f"   - Range: typically [-0.15, 0.15] (normalized)")

    await cache.aclose()

    print("\n✅ Codec analysis complete!")


if __name__ == "__main__":
    asyncio.run(main())
