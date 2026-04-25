#!/usr/bin/env python3
"""
Phase 89: Codec Detection & Decoding
Universal decoder for Redis blobs (base64 → gzip/zstd → JSON/text)
"""

import base64
import gzip
import json
import zstandard as zstd
from typing import Tuple, Any, Optional
from dataclasses import dataclass

try:
    import orjson
    JSON_BACKEND = "orjson"
except ImportError:
    import json as orjson
    JSON_BACKEND = "stdlib"


@dataclass
class DecodedBlob:
    """Result of blob decoding"""
    content: Any  # Decoded content (dict, list, str)
    codec: str  # json|gzip|zstd|base64|unknown
    raw_size: int  # Original blob size
    decoded_size: int  # Decoded size
    is_json: bool  # Whether content is JSON


def detect_codec(data: bytes) -> str:
    """Detect codec from data signature"""
    if len(data) < 2:
        return "unknown"

    # Check for gzip magic bytes
    if data[:2] == b'\x1f\x8b':
        return "gzip"

    # Check for zstd magic bytes
    if data[:4] == b'\x28\xb5\x2f\xfd':
        return "zstd"

    # Check if it looks like JSON
    try:
        first_char = data[:1].decode('utf-8', errors='ignore')
        if first_char in ('{', '['):
            return "json"
    except:
        pass

    # Check if it's base64-ish (A-Za-z0-9+/= and long)
    try:
        text = data.decode('utf-8', errors='strict')
        if len(text) > 20:
            base64_chars = set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=')
            if sum(c in base64_chars for c in text[:100]) > 90:  # >90% base64 chars
                return "base64"
    except:
        pass

    return "unknown"


def decode_blob(data: bytes) -> DecodedBlob:
    """
    Universal blob decoder with automatic codec detection.

    Decoding strategy:
    1. If JSON → parse directly
    2. If base64 → decode → recurse (might be gzip/zstd inside)
    3. If gzip → decompress → recurse
    4. If zstd → decompress → recurse
    5. Unknown → try UTF-8 decode
    """
    raw_size = len(data)
    codec_path = []
    current = data

    # Iteratively decode layers
    for _ in range(5):  # Max 5 layers to prevent infinite loops
        detected = detect_codec(current)
        codec_path.append(detected)

        if detected == "json":
            # Parse JSON directly
            try:
                if JSON_BACKEND == "orjson":
                    content = orjson.loads(current)
                else:
                    content = json.loads(current.decode('utf-8'))

                return DecodedBlob(
                    content=content,
                    codec="+".join(codec_path),
                    raw_size=raw_size,
                    decoded_size=len(str(content).encode('utf-8')),
                    is_json=True
                )
            except Exception as e:
                # Not valid JSON, treat as text
                try:
                    text = current.decode('utf-8')
                    return DecodedBlob(
                        content=text,
                        codec="+".join(codec_path) + "+text",
                        raw_size=raw_size,
                        decoded_size=len(text),
                        is_json=False
                    )
                except:
                    # Can't decode as text either
                    return DecodedBlob(
                        content=current,
                        codec="+".join(codec_path) + "+binary",
                        raw_size=raw_size,
                        decoded_size=len(current),
                        is_json=False
                    )

        elif detected == "base64":
            try:
                current = base64.b64decode(current)
                continue  # Check next layer
            except Exception as e:
                # Base64 decode failed, treat as text
                try:
                    text = current.decode('utf-8')
                    return DecodedBlob(
                        content=text,
                        codec="+".join(codec_path) + "+text",
                        raw_size=raw_size,
                        decoded_size=len(text),
                        is_json=False
                    )
                except:
                    return DecodedBlob(
                        content=current,
                        codec="+".join(codec_path) + "+binary",
                        raw_size=raw_size,
                        decoded_size=len(current),
                        is_json=False
                    )

        elif detected == "gzip":
            try:
                current = gzip.decompress(current)
                continue  # Check next layer
            except Exception as e:
                # Gzip decompress failed
                return DecodedBlob(
                    content=current,
                    codec="+".join(codec_path) + "+error",
                    raw_size=raw_size,
                    decoded_size=len(current),
                    is_json=False
                )

        elif detected == "zstd":
            try:
                dctx = zstd.ZstdDecompressor()
                current = dctx.decompress(current)
                continue  # Check next layer
            except Exception as e:
                # Zstd decompress failed
                return DecodedBlob(
                    content=current,
                    codec="+".join(codec_path) + "+error",
                    raw_size=raw_size,
                    decoded_size=len(current),
                    is_json=False
                )

        else:  # unknown
            # Try UTF-8 decode as last resort
            try:
                text = current.decode('utf-8')
                # Check if it's JSON text
                if text.strip().startswith(('{', '[')):
                    try:
                        if JSON_BACKEND == "orjson":
                            content = orjson.loads(text)
                        else:
                            content = json.loads(text)
                        return DecodedBlob(
                            content=content,
                            codec="+".join(codec_path) + "+json",
                            raw_size=raw_size,
                            decoded_size=len(text),
                            is_json=True
                        )
                    except:
                        pass

                return DecodedBlob(
                    content=text,
                    codec="+".join(codec_path) + "+text",
                    raw_size=raw_size,
                    decoded_size=len(text),
                    is_json=False
                )
            except:
                return DecodedBlob(
                    content=current,
                    codec="+".join(codec_path) + "+binary",
                    raw_size=raw_size,
                    decoded_size=len(current),
                    is_json=False
                )

    # Max layers exceeded
    return DecodedBlob(
        content=current,
        codec="+".join(codec_path) + "+max_depth",
        raw_size=raw_size,
        decoded_size=len(current),
        is_json=False
    )


def safe_get_value(redis_client, key: str) -> Optional[DecodedBlob]:
    """Safely get and decode a Redis value"""
    try:
        raw_value = redis_client.get(key)
        if raw_value is None:
            return None

        if isinstance(raw_value, str):
            raw_value = raw_value.encode('utf-8')

        return decode_blob(raw_value)

    except Exception as e:
        return None


if __name__ == "__main__":
    # Test the decoder
    import sys

    print(f"Phase 89 Codec Detector (JSON backend: {JSON_BACKEND})")
    print("=" * 70)

    # Test cases
    test_cases = [
        (b'{"hello": "world"}', "Plain JSON"),
        (b'[1, 2, 3]', "JSON array"),
        (gzip.compress(b'{"compressed": true}'), "Gzipped JSON"),
        (base64.b64encode(b'{"encoded": true}'), "Base64 JSON"),
        (base64.b64encode(gzip.compress(b'{"both": true}')), "Base64 + Gzip JSON"),
        (b'plain text', "Plain text"),
        (b'\x00\x01\x02\x03', "Binary data"),
    ]

    for data, description in test_cases:
        result = decode_blob(data)
        print(f"\n{description}:")
        print(f"  Codec: {result.codec}")
        print(f"  Size: {result.raw_size} → {result.decoded_size} bytes")
        print(f"  Is JSON: {result.is_json}")
        print(f"  Content preview: {str(result.content)[:80]}...")
