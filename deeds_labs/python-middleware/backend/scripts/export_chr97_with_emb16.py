"""
CH-ROM97 Exporter with 16-dim Embeddings + Heat

Exports complaint data to JSON + binary formats:
- complaint.chr97.json: JSON with full metadata
- complaint.chr97.bin: Binary SIMD-friendly format

Includes:
- 4D manifold coordinates (u, v, w, t)
- 16-dim embeddings (quantized from 768-dim)
- Heat values (u16) from Redis manifold-usage
- Tags and labels for legal context
"""

import json
import struct
import numpy as np
from typing import List, Dict, Any, Tuple
import redis
from pathlib import Path


class Chr97Exporter:
    def __init__(self, redis_url: str = "redis://phase-redis:6379"):
        self.redis = redis.from_url(redis_url)

    def quantize_embedding(self, emb768: np.ndarray) -> List[float]:
        """
        Quantize 768-dim embedding to 16-dim.

        Simple approach: take first 16 dims and normalize.
        For production, use PCA or learned projection.
        """
        if len(emb768) < 16:
            # Pad with zeros
            emb16 = np.zeros(16)
            emb16[:len(emb768)] = emb768
        else:
            # Take first 16 and normalize
            emb16 = emb768[:16]

        # Normalize
        norm = np.linalg.norm(emb16)
        if norm > 1e-5:
            emb16 = emb16 / norm

        return emb16.tolist()

    def get_heat_for_chunk(self, case_id: str, chunk_index: int) -> int:
        """
        Get heat value (u16) from Redis manifold-usage.
        """
        try:
            key = f"manifold-usage:{case_id}:{chunk_index}"
            data = self.redis.json().get(key)
            if data and "heat" in data:
                heat = float(data["heat"])
                # Clamp to [0, 65535]
                heat_u16 = int(np.clip(heat * 10000, 0, 65535))
                return heat_u16
        except Exception:
            pass

        return 0

    def export_json(
        self,
        case_id: str,
        chunks: List[Dict[str, Any]],
        manifold_4d: np.ndarray,  # shape (n, 4)
        embeddings_768: np.ndarray,  # shape (n, 768)
        output_path: str,
    ) -> None:
        """
        Export to JSON format.

        Args:
            case_id: Case identifier
            chunks: List of chunk metadata
            manifold_4d: 4D coordinates
            embeddings_768: 768-dim embeddings
            output_path: Output file path
        """
        n = len(chunks)
        runes = []

        for i in range(n):
            chunk = chunks[i]
            emb16 = self.quantize_embedding(embeddings_768[i])
            heat_u16 = self.get_heat_for_chunk(case_id, chunk.get("chunk_index", i))

            rune = {
                "id": i,
                "tileIndex": i,
                "clusterId": chunk.get("cluster_id", 0),
                "case_id": case_id,
                "chunk_index": chunk.get("chunk_index", i),
                "manifold_float32": manifold_4d[i].tolist(),
                "heat_u16": heat_u16,
                "emb16": emb16,
                "tag": chunk.get("tag", ""),
                "label": chunk.get("label", ""),
            }
            runes.append(rune)

        cartridge = {
            "case_id": case_id,
            "runes": runes,
        }

        with open(output_path, "w") as f:
            json.dump(cartridge, f, indent=2)

        print(f"Exported JSON: {output_path}")

    def export_binary(
        self,
        case_id: str,
        chunks: List[Dict[str, Any]],
        manifold_4d: np.ndarray,  # shape (n, 4)
        embeddings_768: np.ndarray,  # shape (n, 768)
        output_path: str,
    ) -> None:
        """
        Export to binary format (SIMD-friendly).

        Format:
        [u32 count]
        [rune0][rune1]...

        Each rune:
        [f32 u][f32 v][f32 w][f32 t][u16 heat][f32×16 emb]
        = 4 + 4 + 4 + 4 + 2 + 64 = 82 bytes
        """
        n = len(chunks)

        with open(output_path, "wb") as f:
            # Write count
            f.write(struct.pack("<I", n))

            # Write runes
            for i in range(n):
                chunk = chunks[i]
                emb16 = self.quantize_embedding(embeddings_768[i])
                heat_u16 = self.get_heat_for_chunk(case_id, chunk.get("chunk_index", i))

                # 4D position
                f.write(struct.pack("<f", manifold_4d[i, 0]))
                f.write(struct.pack("<f", manifold_4d[i, 1]))
                f.write(struct.pack("<f", manifold_4d[i, 2]))
                f.write(struct.pack("<f", manifold_4d[i, 3]))

                # Heat (u16)
                f.write(struct.pack("<H", heat_u16))

                # 16-dim embedding
                for j in range(16):
                    f.write(struct.pack("<f", emb16[j]))

        print(f"Exported binary: {output_path}")


def main():
    """
    Example usage: export a complaint to CH-ROM97 format.
    """
    exporter = Chr97Exporter()

    # Example data (replace with real data from your pipeline)
    case_id = "doj_v_foo"
    n_chunks = 100

    # Dummy chunks
    chunks = [
        {
            "chunk_index": i,
            "cluster_id": i % 10,
            "tag": f"Section {i}",
            "label": f"Chunk {i}",
        }
        for i in range(n_chunks)
    ]

    # Dummy 4D manifold (from UMAP)
    manifold_4d = np.random.randn(n_chunks, 4).astype(np.float32)

    # Dummy 768-dim embeddings (from embeddinggemma)
    embeddings_768 = np.random.randn(n_chunks, 768).astype(np.float32)

    # Export
    output_dir = Path("topology") / case_id
    output_dir.mkdir(parents=True, exist_ok=True)

    exporter.export_json(
        case_id,
        chunks,
        manifold_4d,
        embeddings_768,
        str(output_dir / "complaint.chr97.json"),
    )

    exporter.export_binary(
        case_id,
        chunks,
        manifold_4d,
        embeddings_768,
        str(output_dir / "complaint.chr97.bin"),
    )


if __name__ == "__main__":
    main()
