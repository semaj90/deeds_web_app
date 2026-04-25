#!/usr/bin/env python3
"""
Phase 89: Redis Blob Decoder
Handles compressed/encoded Redis values with automatic codec detection.

Supports:
  - JSON (plain text)
  - Base64 encoded
  - Gzip compressed
  - Zstd compressed
  - Nested (base64 → gzip → JSON)

Usage:
    from phase89_blob_decoder import decode_redis_value

    decoded = decode_redis_value(redis_bytes)
    print(decoded['codec'])      # 'json', 'gzip+base64', 'zstd', etc.
    print(decoded['content'])    # Actual data
    print(decoded['size_ratio']) # Compression ratio
"""

import base64
import gzip
import json
import zlib
from typing import Any, Dict, Optional, Tuple

try:
    import zstandard as zstd
    HAS_ZSTD = True
except ImportError:
    HAS_ZSTD = False

# Import shared JSON helper
from phase89_json import loads_bytes, loads_str, BACKEND

def detect_gzip(data: bytes) -> bool:
    """Check if data starts with gzip magic bytes."""
    return len(data) >= 2 and data[0:2] == b'\x1f\x8b'

def detect_zstd(data: bytes) -> bool:
    """Check if data starts with zstd magic bytes."""
    return len(data) >= 4 and data[0:4] == b'\x28\xb5\x2f\xfd'

def is_base64_like(data: bytes) -> bool:
    """Heuristic: does this look like base64?"""
    if len(data) < 20:
        return False

    # Base64 uses A-Z, a-z, 0-9, +, /, =
    allowed = set(b'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r ')
    sample = data[:100] if len(data) > 100 else data

    # Count valid base64 chars
    valid_count = sum(1 for byte in sample if byte in allowed)
    ratio = valid_count / len(sample)

    # If >90% valid base64 chars, probably base64
    return ratio > 0.90

def try_base64_decode(data: bytes) -> Optional[bytes]:
    """Attempt base64 decode, return None if fails."""
    try:
        # Remove whitespace
        cleaned = data.replace(b'\n', b'').replace(b'\r', b'').replace(b' ', b'')
        return base64.b64decode(cleaned, validate=True)
    except Exception:
        return None

def try_gzip_decompress(data: bytes) -> Optional[bytes]:
    """Attempt gzip decompress, return None if fails."""
    try:
        return gzip.decompress(data)
    except Exception:
        return None

def try_zstd_decompress(data: bytes) -> Optional[bytes]:
    """Attempt zstd decompress, return None if fails."""
    if not HAS_ZSTD:
        return None
    try:
        dctx = zstd.ZstdDecompressor()
        return dctx.decompress(data)
    except Exception:
        return None

def try_json_parse(data: bytes) -> Tuple[bool, Optional[Any]]:
    """Try parsing as JSON, return (success, data)."""
    try:
        # Check if starts with { or [
        text = data.decode('utf-8', errors='ignore').strip()
        if text and text[0] in ('{', '['):
            parsed = loads_str(text)
            return True, parsed
        return False, None
    except Exception:
        return False, None

def decode_redis_value(raw_value: bytes) -> Dict[str, Any]:
    """
    Decode Redis value with automatic codec detection.

    Returns:
        {
            'success': bool,
            'codec': str,  # 'json', 'base64+gzip', 'zstd', etc.
            'content': Any,  # Decoded content (dict/list/str)
            'original_size': int,
            'decoded_size': int,
            'size_ratio': float,  # decoded/original
            'error': str  # If failed
        }
    """
    original_size = len(raw_value)
    codec_path = []
    current_data = raw_value

    # Stage 1: Try JSON directly
    is_json, parsed = try_json_parse(current_data)
    if is_json:
        return {
            'success': True,
            'codec': 'json',
            'content': parsed,
            'original_size': original_size,
            'decoded_size': len(str(parsed)),
            'size_ratio': len(str(parsed)) / original_size if original_size > 0 else 1.0
        }

    # Stage 2: Try base64 decode
    if is_base64_like(current_data):
        decoded_b64 = try_base64_decode(current_data)
        if decoded_b64:
            codec_path.append('base64')
            current_data = decoded_b64

    # Stage 3: Try decompression
    if detect_gzip(current_data):
        decompressed = try_gzip_decompress(current_data)
        if decompressed:
            codec_path.append('gzip')
            current_data = decompressed
    elif detect_zstd(current_data):
        decompressed = try_zstd_decompress(current_data)
        if decompressed:
            codec_path.append('zstd')
            current_data = decompressed

    # Stage 4: Try JSON again after decompression
    is_json, parsed = try_json_parse(current_data)
    if is_json:
        codec_path.append('json')
        codec = '+'.join(codec_path) if codec_path else 'unknown'
        return {
            'success': True,
            'codec': codec,
            'content': parsed,
            'original_size': original_size,
            'decoded_size': len(str(parsed)),
            'size_ratio': len(str(parsed)) / original_size if original_size > 0 else 1.0
        }

    # Stage 5: Try UTF-8 decode (plain text)
    try:
        text = current_data.decode('utf-8', errors='ignore')
        codec_path.append('text')
        codec = '+'.join(codec_path) if codec_path else 'text'
        return {
            'success': True,
            'codec': codec,
            'content': text,
            'original_size': original_size,
            'decoded_size': len(text),
            'size_ratio': len(text) / original_size if original_size > 0 else 1.0
        }
    except Exception:
        pass

    # Failed all decode attempts
    return {
        'success': False,
        'codec': 'unknown',
        'content': None,
        'original_size': original_size,
        'decoded_size': 0,
        'size_ratio': 0.0,
        'error': f'Could not decode blob (tried: {", ".join(["json", "base64", "gzip", "zstd", "text"])})'
    }

def analyze_redis_codecs(redis_client, key_pattern: str, limit: int = 100) -> Dict[str, Any]:
    """
    Scan Redis keys and analyze codec distribution.

    Returns codec statistics for reporting.
    """
    from collections import Counter

    codec_counts = Counter()
    size_stats = {
        'total_original': 0,
        'total_decoded': 0,
        'samples': []
    }

    count = 0
    for key in redis_client.scan_iter(match=key_pattern, count=100):
        if count >= limit:
            break

        value = redis_client.get(key)
        if not value:
            continue

        result = decode_redis_value(value)
        codec_counts[result['codec']] += 1

        size_stats['total_original'] += result['original_size']
        size_stats['total_decoded'] += result['decoded_size']

        if len(size_stats['samples']) < 10:
            size_stats['samples'].append({
                'key': key.decode('utf-8') if isinstance(key, bytes) else key,
                'codec': result['codec'],
                'original_size': result['original_size'],
                'decoded_size': result['decoded_size'],
                'ratio': result['size_ratio']
            })

        count += 1

    avg_compression = (
        size_stats['total_decoded'] / size_stats['total_original']
        if size_stats['total_original'] > 0 else 1.0
    )

    return {
        'total_analyzed': count,
        'codec_distribution': dict(codec_counts),
        'average_compression_ratio': avg_compression,
        'samples': size_stats['samples']
    }

if __name__ == '__main__':
    # Test with sample data
    import sys

    print(f"📦 JSON Backend: {BACKEND}")
    print(f"🔧 Zstd support: {HAS_ZSTD}")
    print()

    # Test 1: Plain JSON
    test1 = b'{"hello": "world"}'
    result1 = decode_redis_value(test1)
    print(f"Test 1 (plain JSON): {result1['codec']} ✅" if result1['success'] else "❌")

    # Test 2: Gzip compressed JSON
    test2 = gzip.compress(b'{"compressed": true}')
    result2 = decode_redis_value(test2)
    print(f"Test 2 (gzip): {result2['codec']} ✅" if result2['success'] else "❌")

    # Test 3: Base64 + gzip + JSON
    test3 = base64.b64encode(gzip.compress(b'{"nested": "encoding"}'))
    result3 = decode_redis_value(test3)
    print(f"Test 3 (base64+gzip+json): {result3['codec']} ✅" if result3['success'] else "❌")

    print()
    print("✅ Decoder ready!")
