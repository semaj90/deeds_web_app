"""
Latent Collapse Service

Compresses multimodal context to 1D latent vector and selects best-matching rune.
Uses INT4 quantization for compact encoding.

Usage:
    collapser = LatentCollapser()
    rune_token = collapser.collapse_to_rune(multimodal_context)
    context = collapser.expand_from_rune(rune_token)
"""

import logging
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import struct

logger = logging.getLogger(__name__)


@dataclass
class LatentMarker:
    """Latent marker encoding"""

    rune_id: int
    quantized_context: bytes
    confidence: float
    timestamp: float


class LatentCollapser:
    """Latent collapse service for 1D compression"""

    def __init__(self, num_runes: int = 26, latent_dim: int = 768):
        """
        Initialize latent collapser.

        Args:
            num_runes: Number of runes (26 for alphabet)
            latent_dim: Dimension of latent space
        """
        self.num_runes = num_runes
        self.latent_dim = latent_dim

        # Rune centroids (learned from training data)
        self.rune_centroids = np.random.randn(num_runes, latent_dim) * 0.1

        logger.info(f"LatentCollapser initialized (runes={num_runes}, dim={latent_dim})")

    def collapse_to_rune(self, multimodal_context: np.ndarray) -> Tuple[int, float]:
        """
        Collapse multimodal context to best-matching rune.

        Args:
            multimodal_context: Multimodal embedding (latent_dim,)

        Returns:
            Tuple of (rune_id, confidence)
        """
        try:
            # Normalize context
            context_norm = multimodal_context / (np.linalg.norm(multimodal_context) + 1e-8)

            # Compute distances to all rune centroids
            distances = np.array(
                [np.linalg.norm(context_norm - centroid) for centroid in self.rune_centroids]
            )

            # Find best matching rune
            best_rune_id = int(np.argmin(distances))
            min_distance = float(distances[best_rune_id])

            # Confidence: inverse of distance (normalized)
            confidence = 1.0 / (1.0 + min_distance)

            logger.debug(f"Collapsed to rune {best_rune_id} (confidence={confidence:.2f})")

            return best_rune_id, confidence

        except Exception as e:
            logger.error(f"Latent collapse failed: {e}")
            return 0, 0.0

    def collapse_batch(self, contexts: np.ndarray) -> List[Tuple[int, float]]:
        """
        Collapse batch of contexts to runes.

        Args:
            contexts: Batch of contexts (N x latent_dim)

        Returns:
            List of (rune_id, confidence) tuples
        """
        results = []
        for context in contexts:
            rune_id, confidence = self.collapse_to_rune(context)
            results.append((rune_id, confidence))
        return results

    def quantize_context(self, context: np.ndarray) -> bytes:
        """
        Quantize context to INT4 format.

        Args:
            context: Context vector (latent_dim,)

        Returns:
            Quantized bytes
        """
        try:
            # Normalize to [-1, 1]
            context_norm = context / (np.linalg.norm(context) + 1e-8)

            # Scale to [-8, 7] (INT4 range)
            context_scaled = (context_norm * 7).astype(np.int8)

            # Pack as bytes (2 values per byte)
            quantized = np.packbits(context_scaled)

            logger.debug(f"Quantized context: {len(context)} -> {len(quantized)} bytes")

            return quantized.tobytes()

        except Exception as e:
            logger.error(f"Context quantization failed: {e}")
            return b""

    def dequantize_context(self, quantized: bytes, dim: int = 768) -> np.ndarray:
        """
        Dequantize INT4 context.

        Args:
            quantized: Quantized bytes
            dim: Original dimension

        Returns:
            Dequantized context
        """
        try:
            # Unpack bytes
            quantized_arr = np.frombuffer(quantized, dtype=np.uint8)

            # Unpack bits
            context_scaled = np.unpackbits(quantized_arr)[:dim]

            # Scale back to [-1, 1]
            context = context_scaled.astype(np.float32) / 7.0

            logger.debug(f"Dequantized context: {len(quantized)} -> {len(context)} values")

            return context

        except Exception as e:
            logger.error(f"Context dequantization failed: {e}")
            return np.zeros(dim)

    def create_latent_marker(
        self, multimodal_context: np.ndarray, timestamp: float
    ) -> LatentMarker:
        """
        Create latent marker from context.

        Args:
            multimodal_context: Multimodal embedding
            timestamp: Timestamp

        Returns:
            Latent marker
        """
        try:
            # Collapse to rune
            rune_id, confidence = self.collapse_to_rune(multimodal_context)

            # Quantize context
            quantized = self.quantize_context(multimodal_context)

            marker = LatentMarker(
                rune_id=rune_id,
                quantized_context=quantized,
                confidence=confidence,
                timestamp=timestamp,
            )

            logger.debug(f"Created latent marker: rune={rune_id}, confidence={confidence:.2f}")

            return marker

        except Exception as e:
            logger.error(f"Latent marker creation failed: {e}")
            return LatentMarker(rune_id=0, quantized_context=b"", confidence=0.0, timestamp=timestamp)

    def encode_marker_to_hex(self, marker: LatentMarker) -> str:
        """
        Encode latent marker to hex string.

        Args:
            marker: Latent marker

        Returns:
            Hex-encoded marker
        """
        try:
            # Pack marker: rune_id (1 byte) + confidence (4 bytes) + quantized (variable)
            packed = struct.pack("<B", marker.rune_id)
            packed += struct.pack("<f", marker.confidence)
            packed += marker.quantized_context

            # Convert to hex
            hex_str = packed.hex()

            logger.debug(f"Encoded marker to hex: {len(hex_str)} chars")

            return hex_str

        except Exception as e:
            logger.error(f"Marker encoding failed: {e}")
            return ""

    def decode_marker_from_hex(self, hex_str: str) -> Optional[LatentMarker]:
        """
        Decode latent marker from hex string.

        Args:
            hex_str: Hex-encoded marker

        Returns:
            Latent marker or None
        """
        try:
            # Convert from hex
            packed = bytes.fromhex(hex_str)

            # Unpack marker
            rune_id = struct.unpack("<B", packed[0:1])[0]
            confidence = struct.unpack("<f", packed[1:5])[0]
            quantized_context = packed[5:]

            marker = LatentMarker(
                rune_id=rune_id,
                quantized_context=quantized_context,
                confidence=confidence,
                timestamp=0.0,
            )

            logger.debug(f"Decoded marker from hex: rune={rune_id}, confidence={confidence:.2f}")

            return marker

        except Exception as e:
            logger.error(f"Marker decoding failed: {e}")
            return None

    def get_stats(self) -> Dict:
        """Get collapser statistics"""
        return {
            "num_runes": self.num_runes,
            "latent_dim": self.latent_dim,
            "centroid_shape": self.rune_centroids.shape,
        }


# Singleton instance
_latent_collapser = None


def get_latent_collapser() -> LatentCollapser:
    """Get or create singleton latent collapser"""
    global _latent_collapser
    if _latent_collapser is None:
        _latent_collapser = LatentCollapser()
    return _latent_collapser
