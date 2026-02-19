"""
FP16 Codec: Compress/decompress float32 embeddings to fp16 for Redis caching

Reduces embedding size by 50% while maintaining accuracy within 0.01 cosine distance.

Usage:
    codec = FP16Codec()

    # Compress
    fp16_bytes = codec.encode(embedding_fp32)

    # Decompress
    embedding_fp32 = codec.decode(fp16_bytes)

    # Verify accuracy
    distance = codec.cosine_distance(original, decoded)
    assert distance < 0.01
"""

import struct
import numpy as np
from typing import List, Tuple
import logging

logger = logging.getLogger(__name__)


class FP16Codec:
    """FP16 codec for embedding compression"""

    @staticmethod
    def encode(embedding: List[float]) -> bytes:
        """
        Compress float32 embedding to fp16 bytes.

        Args:
            embedding: List of float32 values (e.g., 768-dim)

        Returns:
            Bytes: CBOR-like format (2 bytes per value)
        """
        if not embedding:
            return b""

        # Convert to numpy array
        arr = np.array(embedding, dtype=np.float32)

        # Convert to float16
        fp16_arr = arr.astype(np.float16)

        # Pack as bytes
        return fp16_arr.tobytes()

    @staticmethod
    def decode(data: bytes) -> List[float]:
        """
        Decompress fp16 bytes to float32 embedding.

        Args:
            data: Bytes from encode()

        Returns:
            List of float32 values
        """
        if not data:
            return []

        # Unpack bytes
        fp16_arr = np.frombuffer(data, dtype=np.float16)

        # Convert to float32
        arr = fp16_arr.astype(np.float32)

        # Return as list
        return arr.tolist()

    @staticmethod
    def cosine_distance(a: List[float], b: List[float]) -> float:
        """
        Compute cosine distance between two embeddings.

        Args:
            a: First embedding
            b: Second embedding

        Returns:
            Distance (0-1, where 0 = identical, 1 = opposite)
        """
        a_arr = np.array(a, dtype=np.float32)
        b_arr = np.array(b, dtype=np.float32)

        # Normalize
        a_norm = a_arr / (np.linalg.norm(a_arr) + 1e-8)
        b_norm = b_arr / (np.linalg.norm(b_arr) + 1e-8)

        # Cosine similarity
        similarity = np.dot(a_norm, b_norm)

        # Distance (1 - similarity)
        distance = 1.0 - similarity

        return float(distance)

    @staticmethod
    def verify_accuracy(original: List[float], decoded: List[float], tolerance: float = 0.01) -> Tuple[bool, float]:
        """
        Verify fp16 compression accuracy.

        Args:
            original: Original float32 embedding
            decoded: Decoded embedding from fp16
            tolerance: Maximum allowed cosine distance

        Returns:
            Tuple of (is_accurate, distance)
        """
        distance = FP16Codec.cosine_distance(original, decoded)
        is_accurate = distance < tolerance

        return is_accurate, distance

    @staticmethod
    def batch_encode(embeddings: List[List[float]]) -> List[bytes]:
        """
        Compress multiple embeddings.

        Args:
            embeddings: List of embeddings

        Returns:
            List of compressed bytes
        """
        return [FP16Codec.encode(emb) for emb in embeddings]

    @staticmethod
    def batch_decode(data_list: List[bytes]) -> List[List[float]]:
        """
        Decompress multiple embeddings.

        Args:
            data_list: List of compressed bytes

        Returns:
            List of embeddings
        """
        return [FP16Codec.decode(data) for data in data_list]


# Example usage
if __name__ == "__main__":
    # Create test embedding
    original = [0.1 * i for i in range(768)]

    # Compress
    codec = FP16Codec()
    compressed = codec.encode(original)
    print(f"Original size: {len(original) * 4} bytes (float32)")
    print(f"Compressed size: {len(compressed)} bytes (fp16)")
    print(f"Compression ratio: {len(original) * 4 / len(compressed):.1f}x")

    # Decompress
    decoded = codec.decode(compressed)

    # Verify accuracy
    is_accurate, distance = codec.verify_accuracy(original, decoded)
    print(f"Cosine distance: {distance:.6f}")
    print(f"Accurate (< 0.01): {is_accurate}")

    # Batch test
    embeddings = [original for _ in range(100)]
    compressed_batch = codec.batch_encode(embeddings)
    decoded_batch = codec.batch_decode(compressed_batch)
    print(f"Batch compressed: {len(compressed_batch)} embeddings")
    print(f"Batch size: {sum(len(c) for c in compressed_batch)} bytes")
