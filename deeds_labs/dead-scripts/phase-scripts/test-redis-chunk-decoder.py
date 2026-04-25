#!/usr/bin/env python3
"""Test blob decoder on actual Redis chunk values."""

import asyncio
import redis.asyncio as aioredis
from phase89_blob_decoder import decode_redis_value
from phase89_json import dumps

async def test_redis_chunks():
    """Test decoder on real Redis chunks."""
    redis_client = await aioredis.from_url(
        'redis://localhost:6379',
        decode_responses=False
    )

    print("🔍 Testing blob decoder on Redis chunks...")
    print("=" * 70)
    print()

    # Test phase89:chunk:* keys
    count = 0
    async for key in redis_client.scan_iter(match='phase89:chunk:*', count=100):
        if count >= 5:
            break

        key_str = key.decode('utf-8')
        value = await redis_client.get(key)

        if value:
            result = decode_redis_value(value)

            print(f"Key: {key_str[:80]}...")
            print(f"Codec: {result['codec']}")
            print(f"Success: {result['success']}")
            print(f"Original size: {result['original_size']:,} bytes")
            print(f"Decoded size: {result['decoded_size']:,} bytes")
            print(f"Compression ratio: {result['size_ratio']:.2f}x")

            if result['success'] and isinstance(result['content'], dict):
                print(f"Content keys: {list(result['content'].keys())[:5]}")

            print()
            count += 1

    await redis_client.aclose()
    print(f"✅ Tested {count} chunks")

if __name__ == '__main__':
    asyncio.run(test_redis_chunks())
