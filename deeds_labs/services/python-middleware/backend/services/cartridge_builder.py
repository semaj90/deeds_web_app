"""
CH-ROM97 Cartridge Builder

Builds binary cartridges encoding runes, tensors, tiles, metadata, and graph edges.
Uses struct packing for efficient binary format.

Format:
- Header: Magic (4 bytes), Version (4 bytes), Num Runes (4 bytes), Num Edges (4 bytes)
- Runes: For each rune: ID (1 byte), UUID (16 bytes), Embedding (1536 bytes FP16)
- Tiles: For each tile: Index (1 byte), Tile Data (1024 bytes)
- Edges: For each edge: From (1 byte), To (1 byte), Weight (4 bytes)
- Metadata: JSON-encoded metadata

Usage:
    builder = CartridgeBuilder()
    cartridge = builder.build_ch_rom97(runes, tiles, edges, metadata)
    serialized = builder.serialize_cartridge(cartridge)
"""

import logging
import struct
import json
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import time

logger = logging.getLogger(__name__)


@dataclass
class Cartridge:
    """CH-ROM97 Cartridge"""

    magic: int
    version: int
    num_runes: int
    num_edges: int
    runes: List[Dict]
    tiles: List[bytes]
    edges: List[Tuple[int, int, float]]
    metadata: Dict


class CartridgeBuilder:
    """CH-ROM97 Cartridge builder"""

    MAGIC = 0x4348524F  # 'CHRO' in hex
    VERSION = 97

    def __init__(self):
        """Initialize cartridge builder"""
        logger.info("CartridgeBuilder initialized")

    def build_ch_rom97(
        self,
        runes: List[Dict],
        tiles: List[bytes],
        edges: List[Tuple[int, int, float]],
        metadata: Optional[Dict] = None,
    ) -> Cartridge:
        """
        Build CH-ROM97 cartridge.

        Args:
            runes: List of rune dictionaries with id, uuid, embedding
            tiles: List of tile byte data
            edges: List of (from_id, to_id, weight) tuples
            metadata: Optional metadata dictionary

        Returns:
            Cartridge object
        """
        try:
            if metadata is None:
                metadata = {}

            cartridge = Cartridge(
                magic=self.MAGIC,
                version=self.VERSION,
                num_runes=len(runes),
                num_edges=len(edges),
                runes=runes,
                tiles=tiles,
                edges=edges,
                metadata=metadata,
            )

            logger.info(
                f"Built cartridge: {len(runes)} runes, {len(tiles)} tiles, {len(edges)} edges"
            )

            return cartridge

        except Exception as e:
            logger.error(f"Cartridge building failed: {e}")
            return Cartridge(
                magic=self.MAGIC,
                version=self.VERSION,
                num_runes=0,
                num_edges=0,
                runes=[],
                tiles=[],
                edges=[],
                metadata={},
            )

    def serialize_cartridge(self, cartridge: Cartridge) -> bytes:
        """
        Serialize cartridge to binary format.

        Args:
            cartridge: Cartridge object

        Returns:
            Binary cartridge data
        """
        try:
            data = b""

            # Header
            data += struct.pack("<I", cartridge.magic)
            data += struct.pack("<I", cartridge.version)
            data += struct.pack("<I", cartridge.num_runes)
            data += struct.pack("<I", cartridge.num_edges)

            # Runes
            for rune in cartridge.runes:
                data += struct.pack("<B", rune.get("id", 0))

                # UUID (16 bytes)
                uuid_str = rune.get("uuid", "")[:16].ljust(16, "\x00")
                data += uuid_str.encode()[:16]

                # Embedding (FP16, 768 values = 1536 bytes)
                embedding = rune.get("embedding", np.zeros(768))
                if isinstance(embedding, list):
                    embedding = np.array(embedding)
                embedding_fp16 = embedding.astype(np.float16)
                data += embedding_fp16.tobytes()

            # Tiles
            for tile in cartridge.tiles:
                if isinstance(tile, bytes):
                    data += tile
                else:
                    data += bytes(tile)

            # Edges
            for from_id, to_id, weight in cartridge.edges:
                data += struct.pack("<B", from_id)
                data += struct.pack("<B", to_id)
                data += struct.pack("<f", weight)

            # Metadata (JSON)
            metadata_json = json.dumps(cartridge.metadata)
            metadata_bytes = metadata_json.encode()
            data += struct.pack("<I", len(metadata_bytes))
            data += metadata_bytes

            logger.info(f"Serialized cartridge: {len(data)} bytes")

            return data

        except Exception as e:
            logger.error(f"Cartridge serialization failed: {e}")
            return b""

    def deserialize_cartridge(self, data: bytes) -> Optional[Cartridge]:
        """
        Deserialize cartridge from binary format.

        Args:
            data: Binary cartridge data

        Returns:
            Cartridge object or None
        """
        try:
            offset = 0

            # Header
            magic = struct.unpack("<I", data[offset : offset + 4])[0]
            offset += 4

            version = struct.unpack("<I", data[offset : offset + 4])[0]
            offset += 4

            num_runes = struct.unpack("<I", data[offset : offset + 4])[0]
            offset += 4

            num_edges = struct.unpack("<I", data[offset : offset + 4])[0]
            offset += 4

            if magic != self.MAGIC:
                logger.error(f"Invalid magic: {magic:08x}")
                return None

            # Runes
            runes = []
            for i in range(num_runes):
                rune_id = struct.unpack("<B", data[offset : offset + 1])[0]
                offset += 1

                uuid_bytes = data[offset : offset + 16]
                uuid_str = uuid_bytes.decode().rstrip("\x00")
                offset += 16

                embedding_bytes = data[offset : offset + 1536]
                embedding = np.frombuffer(embedding_bytes, dtype=np.float16).astype(np.float32)
                offset += 1536

                runes.append(
                    {
                        "id": rune_id,
                        "uuid": uuid_str,
                        "embedding": embedding.tolist(),
                    }
                )

            # Tiles (skip for now - would need tile size info)
            tiles = []

            # Edges
            edges = []
            for i in range(num_edges):
                from_id = struct.unpack("<B", data[offset : offset + 1])[0]
                offset += 1

                to_id = struct.unpack("<B", data[offset : offset + 1])[0]
                offset += 1

                weight = struct.unpack("<f", data[offset : offset + 4])[0]
                offset += 4

                edges.append((from_id, to_id, weight))

            # Metadata
            if offset < len(data):
                metadata_len = struct.unpack("<I", data[offset : offset + 4])[0]
                offset += 4

                metadata_bytes = data[offset : offset + metadata_len]
                metadata = json.loads(metadata_bytes.decode())
            else:
                metadata = {}

            cartridge = Cartridge(
                magic=magic,
                version=version,
                num_runes=num_runes,
                num_edges=num_edges,
                runes=runes,
                tiles=tiles,
                edges=edges,
                metadata=metadata,
            )

            logger.info(f"Deserialized cartridge: {num_runes} runes, {num_edges} edges")

            return cartridge

        except Exception as e:
            logger.error(f"Cartridge deserialization failed: {e}")
            return None

    def get_cartridge_size(self, cartridge: Cartridge) -> Dict:
        """
        Get cartridge size breakdown.

        Args:
            cartridge: Cartridge object

        Returns:
            Size breakdown dictionary
        """
        header_size = 16  # 4 * 4 bytes
        rune_size = cartridge.num_runes * (1 + 16 + 1536)  # ID + UUID + Embedding
        edge_size = cartridge.num_edges * (1 + 1 + 4)  # From + To + Weight
        metadata_size = len(json.dumps(cartridge.metadata).encode())

        total_size = header_size + rune_size + edge_size + metadata_size

        return {
            "header": header_size,
            "runes": rune_size,
            "edges": edge_size,
            "metadata": metadata_size,
            "total": total_size,
        }


# Singleton instance
_cartridge_builder = None


def get_cartridge_builder() -> CartridgeBuilder:
    """Get or create singleton cartridge builder"""
    global _cartridge_builder
    if _cartridge_builder is None:
        _cartridge_builder = CartridgeBuilder()
    return _cartridge_builder
