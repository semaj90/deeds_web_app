#!/usr/bin/env python3
"""
CH-ROM97 Image Processing Pipeline (Ollama-driven)
- YOLOptional SAM) for visual segments
- Ollama embeddings (embeddinggemma / gemma3-legal) for text
- DBSCAN + 4D quantization for topology
- Qdrant + Postgres + MinIO for storage
- Exports image_topology.json for CH-ROM97 builder
"""

import os
import json
import numpy as np
import cv2
import requests
from typing import Dict, List, Any, Optional

from ultralytics import YOLO
from segment_anything import SamPredictor, sam_model_registry

import torch
from sklearn.cluster import DBSCAN

import qdrant_client
from qdrant_client.models import PointStruct, VectorParams, Distance

import psycopg2
from psycopg2.extras import execute_values

import boto3


# ---------- Ollama embedding helper ----------

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "embeddinggemma:latest")


def ollama_embed(text: str) -> np.ndarray:
    """
    Call Ollama /api/embeddings and return a float32 numpy vector.
    Robust to both 'embedding' and 'embeddings' response keys.
    """
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": OLLAMA_EMBED_MODEL, "prompt": text},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        if "embedding" in data:
            vec = data["embedding"]
        elif "embeddings" in data:
            vec = data["embeddings"][0]
        else:
            raise RuntimeError(
                f"Unexpected Ollama embeddings response keys: {list(data.keys())}"
            )

        return np.array(vec, dtype=np.float32)
    except Exception as e:
        print(f"❌ Ollama embedding failed: {e}")
        raise


def quantize_4d(vectors: np.ndarray) -> np.ndarray:
    """
    Quantize 4D float32 vectors to uint8 (0-255 range).
    Used for NES/N64-style spatial hashing.
    """
    if len(vectors) == 0:
        return np.empty((0, 4), dtype=np.uint8)

    # Normalize to [-1, 1]
    vmin = vectors.min(axis=0)
    vmax = vectors.max(axis=0)
    vrange = vmax - vmin
    vrange[vrange == 0] = 1  # Avoid division by zero

    normalized = (vectors - vmin) / vrange * 2 - 1

    # Map to [0, 255]
    quantized = ((normalized + 1) / 2 * 255).astype(np.uint8)
    return quantized


# ---------- Main Processor ----------


class CHR97ImageProcessor:
    """
    Processes legal document images into CH-ROM97 topology.
    Integrates YOLO, SAM, Ollama embeddings, and vector storage.
    """

    def __init__(
        self,
        qdrant_host: str = "localhost",
        qdrant_port: int = 6333,
        pg_host: str = "localhost",
        pg_db: str = "legal_ai_db",
        pg_user: str = "postgres",
        pg_password: str = "password",
        minio_endpoint: str = "http://localhost:9000",
        minio_access_key: str = "minioadmin",
        minio_secret_key: str = "minioadmin",
    ):
        print("🚀 Initializing CH-ROM97 Image Processor...")

        # YOLO: use small model for speed
        self.yolo = YOLO("yolov8n.pt")
        print("✅ YOLO initialized")

        # SAM: optional
        self.sam = None
        try:
            sam = sam_model_registry["vit_b"](checkpoint="sam_vit_b_01ec64.pth")
            self.sam = SamPredictor(sam)
            print("✅ SAM initialized")
        except Exception as e:
            print(f"⚠️  SAM checkpoint not found ({e}); segmentation disabled")

        # Qdrant collection: 768-d text embeddings
        self.qdrant = qdrant_client.QdrantClient(qdrant_host, port=qdrant_port)
        try:
            self.qdrant.recreate_collection(
                collection_name="legal_images",
                vectors_config=VectorParams(size=768, distance=Distance.COSINE),
            )
            print("✅ Qdrant collection initialized")
        except Exception as e:
            print(f"⚠️  Qdrant init warning: {e}")

        # PostgreSQL connection
        self.pg_conn = psycopg2.connect(
            host=pg_host,
            database=pg_db,
            user=pg_user,
            password=pg_password,
        )
        print("✅ PostgreSQL connected")

        # MinIO / S3 client
        self.minio = boto3.client(
            "s3",
            endpoint_url=minio_endpoint,
            aws_access_key_id=minio_access_key,
            aws_secret_access_key=minio_secret_key,
        )
        self.topology_bucket = "chr97-topology-cluster"

        try:
            self.minio.create_bucket(Bucket=self.topology_bucket)
            print("✅ MinIO bucket ready")
        except Exception:
            # Bucket probably already exists
            pass

    # ---------- Pipeline entry ----------

    def process_legal_image(
        self, image_path: str, metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Main pipeline: image → YOLO → SAM → Ollama embeddings → topology → storage.
        """
        print(f"\n🔍 Processing legal image: {image_path}")

        image = cv2.imread(image_path)
        if image is None:
            raise FileNotFoundError(f"Could not read image: {image_path}")

        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        # 1) YOLO detection
        yolo_results = self.yolo(image_rgb)
        detections = self._extract_detections(yolo_results)
        print(f"   📦 Detected {len(detections)} objects")

        # 2) SAM segmentation (if available)
        segments = self._segment_detections(image_rgb, detections)
        print(f"   🎭 Generated {len(segments)} segments")

        # 3) Mock OCR text per segment (later: plug real OCR)
        segment_texts = self._extract_segment_texts(segments)

        # 4) Multimodal embeddings (Ollama text + visual features)
        embeddings = self.generate_multimodal_embeddings(
            segment_texts, segments, image_rgb
        )
        print(f"   🧠 Generated {len(embeddings)} embeddings")

        # 5) Topology (DBSCAN + synthetic 4D + quant4)
        topology = self.create_topology_structure(embeddings, segments, metadata)
        print(f"   🗺️  Topology created with {len(topology['clusters'])} clusters")

        # 6) Persist vectors (Qdrant + Postgres)
        self.store_in_vector_databases(embeddings, topology, metadata)
        print("   💾 Stored in Qdrant + Postgres")

        # 7) Topology summaries → MinIO
        summaries = self.generate_topology_summaries(topology, metadata)
        self.store_summaries_in_minio(summaries, metadata)
        print(f"   📦 Stored {len(summaries)} summaries in MinIO")

        # 8) Export topology for CH-ROM97 builder
        topology_export = self._prepare_topology_export(topology, metadata)
        with open("image_topology.json", "w", encoding="utf-8") as f:
            json.dump(topology_export, f, indent=2)
        print("   ✅ Exported image_topology.json")

        return topology_export

    # ---------- Detection & Segmentation ----------

    def _extract_detections(self, yolo_results) -> List[Dict[str, Any]]:
        """Extract YOLO detections with confidence > 0.5."""
        detections = []
        for result in yolo_results:
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf = float(box.conf[0].cpu().numpy())
                cls = int(box.cls[0].cpu().numpy())
                if conf > 0.5:
                    detections.append(
                        {
                            "bbox": [int(x1), int(y1), int(x2), int(y2)],
                            "confidence": conf,
                            "class": cls,
                            "class_name": result.names[cls],
                        }
                    )
        return detections

    def _segment_detections(
        self, image_rgb: np.ndarray, detections: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Apply SAM segmentation to detections, or fallback to full image."""
        segments = []

        if self.sam is not None and detections:
            self.sam.set_image(image_rgb)
            for det in detections:
                box = np.array(det["bbox"])
                try:
                    masks, scores, _ = self.sam.predict(
                        box=box, multimask_output=True
                    )
                    best_idx = int(np.argmax(scores))
                    best_mask = masks[best_idx].astype(np.uint8) * 255
                    segments.append(
                        {
                            "detection": det,
                            "mask": best_mask,
                            "mask_score": float(scores[best_idx]),
                        }
                    )
                except Exception as e:
                    print(f"   ⚠️  SAM segmentation failed for box {det['bbox']}: {e}")
        else:
            # Fallback: whole image as one segment
            mask = np.ones(image_rgb.shape[:2], dtype=np.uint8) * 255
            segments.append(
                {
                    "detection": {
                        "bbox": [0, 0, image_rgb.shape[1], image_rgb.shape[0]],
                        "confidence": 1.0,
                        "class": -1,
                        "class_name": "full_image",
                    },
                    "mask": mask,
                    "mask_score": 1.0,
                }
            )

        return segments

    def _extract_segment_texts(self, segments: List[Dict[str, Any]]) -> List[str]:
        """Extract text from segments (placeholder for real OCR)."""
        texts = []
        for i, seg in enumerate(segments):
            class_name = seg["detection"]["class_name"]
            text = f"Legal text segment {i}: {class_name}"
            texts.append(text)
        return texts

    # ---------- Embeddings ----------

    def generate_multimodal_embeddings(
        self,
        texts: List[str],
        segments: List[Dict[str, Any]],
        image_rgb: np.ndarray,
    ) -> List[Dict[str, Any]]:
        """Generate multimodal embeddings: Ollama text + visual features."""
        embeddings = []

        for text, seg in zip(texts, segments):
            # Text embedding via Ollama (768-d for embeddinggemma)
            text_emb = ollama_embed(text)

            # Visual features from mask + image
            visual_features = self.extract_visual_features(seg["mask"], image_rgb)

            # Combined for local clustering / topology
            combined = np.concatenate([text_emb, visual_features])

            embeddings.append(
                {
                    "text": text,
                    "text_embedding": text_emb,
                    "visual_features": visual_features,
                    "combined": combined,
                    "segment_info": seg,
                }
            )

        return embeddings

    def extract_visual_features(
        self, mask: np.ndarray, image_rgb: np.ndarray
    ) -> np.ndarray:
        """Extract visual features: color histogram + shape metrics."""
        masked_image = cv2.bitwise_and(image_rgb, image_rgb, mask=mask)

        # 3D color histogram (8x8x8 = 512 bins)
        hist = cv2.calcHist(
            [masked_image], [0, 1, 2], mask, [8, 8, 8], [0, 256, 0, 256, 0, 256]
        )
        hist = cv2.normalize(hist, hist).flatten()

        # Simple shape features
        contours, _ = cv2.findContours(
            mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        if contours:
            c = contours[0]
            area = cv2.contourArea(c)
            perim = cv2.arcLength(c, True)
            shape_features = np.array([area, perim, len(c)], dtype=np.float32)
        else:
            shape_features = np.zeros(3, dtype=np.float32)

        return np.concatenate([hist.astype(np.float32), shape_features])

    # ---------- Topology / Clustering ----------

    def create_topology_structure(
        self,
        embeddings: List[Dict[str, Any]],
        segments: List[Dict[str, Any]],
        metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Create topology: DBSCAN clustering + 4D manifold + quantization."""
        vectors = np.array([e["combined"] for e in embeddings], dtype=np.float32)

        if len(vectors) == 0:
            return {
                "embeddings": embeddings,
                "clusters": [],
                "topology_4d": [],
                "quantized_topology": [],
                "segments": segments,
                "metadata": metadata,
            }

        # DBSCAN clustering
        clustering = DBSCAN(eps=0.5, min_samples=2).fit(vectors)
        labels = clustering.labels_

        # Build cluster centroids
        centroids = []
        unique_labels = set(labels)
        for lbl in unique_labels:
            if lbl == -1:
                continue
            pts = vectors[labels == lbl]
            centroids.append(pts.mean(axis=0))

        centroids = np.array(centroids, dtype=np.float32)

        if len(centroids) > 0:
            # Create synthetic 4D manifold (later: use real manifold from Phase 6)
            topo_4d = np.random.rand(len(centroids), 4).astype(np.float32) * 2 - 1
            quant_4d = quantize_4d(topo_4d)
        else:
            topo_4d = np.empty((0, 4), dtype=np.float32)
            quant_4d = np.empty((0, 4), dtype=np.uint8)

        return {
            "embeddings": embeddings,
            "clusters": labels.tolist(),
            "topology_4d": topo_4d.tolist(),
            "quantized_topology": quant_4d.tolist(),
            "segments": segments,
            "metadata": metadata,
        }

    # ---------- Storage ----------

    def store_in_vector_databases(
        self,
        embeddings: List[Dict[str, Any]],
        topology: Dict[str, Any],
        metadata: Dict[str, Any],
    ) -> None:
        """Store embeddings in Qdrant + Postgres."""
        # Qdrant: store ONLY 768-d text vector
        points = []
        for i, emb in enumerate(embeddings):
            points.append(
                PointStruct(
                    id=i,
                    vector=emb["text_embedding"].tolist(),
                    payload={
                        "text": emb["text"],
                        "cluster": topology["clusters"][i] if i < len(topology["clusters"]) else -1,
                        "metadata": metadata,
                    },
                )
            )

        self.qdrant.upsert(collection_name="legal_images", points=points)

        # Postgres table (ensure vector(768) exists in PG 17 with pgvector)
        with self.pg_conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS legal_image_texts (
                    id SERIAL PRIMARY KEY,
                    text TEXT,
                    embedding VECTOR(768),
                    cluster_id INTEGER,
                    confidence REAL,
                    metadata JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """
            )

            rows = []
            for i, emb in enumerate(embeddings):
                rows.append(
                    (
                        emb["text"],
                        emb["text_embedding"].tolist(),
                        topology["clusters"][i] if i < len(topology["clusters"]) else -1,
                        float(emb["segment_info"]["mask_score"]),
                        json.dumps(metadata),
                    )
                )

            execute_values(
                cur,
                """
                INSERT INTO legal_image_texts
                  (text, embedding, cluster_id, confidence, metadata)
                VALUES %s
            """,
                rows,
            )

        self.pg_conn.commit()

    # ---------- Summaries + MinIO ----------

    def generate_topology_summaries(
        self, topology: Dict[str, Any], metadata: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Generate cluster summaries for MinIO storage."""
        summaries = []
        clusters = topology["clusters"]
        groups = {}

        for i, cid in enumerate(clusters):
            groups.setdefault(cid, []).append(i)

        for cid, idxs in groups.items():
            if cid == -1:
                continue

            texts = [topology["embeddings"][i]["text"] for i in idxs]
            summary_text = (
                f"Cluster {cid}: {len(idxs)} segments - "
                + ", ".join(texts[:3])
                + ("..." if len(texts) > 3 else "")
            )

            if cid < len(topology["topology_4d"]):
                topo_coords = topology["topology_4d"][cid]
                quant_coords = topology["quantized_topology"][cid]
            else:
                topo_coords = None
                quant_coords = None

            summaries.append(
                {
                    "cluster_id": cid,
                    "summary": summary_text,
                    "topology_coordinates": topo_coords,
                    "quantized_coordinates": quant_coords,
                    "segment_count": len(idxs),
                    "metadata": metadata,
                    "created_at": str(np.datetime64("now")),
                }
            )

        return summaries

    def store_summaries_in_minio(
        self, summaries: List[Dict[str, Any]], metadata: Dict[str, Any]
    ) -> None:
        """Store topology summaries in MinIO."""
        for s in summaries:
            key = (
                f"topology_summary_cluster_{s['cluster_id']}_"
                f"{metadata.get('case_id', 'unknown')}.json"
            )
            self.minio.put_object(
                Bucket=self.topology_bucket,
                Key=key,
                Body=json.dumps(s, indent=2),
                ContentType="application/json",
            )

    # ---------- Export for CH-ROM97 ----------

    def _prepare_topology_export(
        self, topology: Dict[str, Any], metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Prepare topology for CH-ROM97 builder (image_topology.json)."""
        return {
            "version": "1.0",
            "type": "image_topology",
            "metadata": metadata,
            "clusters": topology["clusters"],
            "topology_4d": topology["topology_4d"],
            "quantized_topology": topology["quantized_topology"],
            "segment_count": len(topology["segments"]),
            "cluster_count": len(set(c for c in topology["clusters"] if c != -1)),
            "embeddings_dim": 768 + 515,  # text (768) + visual (515)
            "created_at": str(np.datetime64("now")),
        }


def main():
    """Example usage."""
    processor = CHR97ImageProcessor()

    metadata = {
        "case_id": "LEGAL-IMG-001",
        "document_type": "contract",
        "confidentiality": "privileged",
    }

    print("\n✅ CH-ROM97 Image Processing Pipeline (Ollama) initialized")
    print("   Ready to process legal document images with YOLO/SAM + Ollama embeddings")
    print(f"   Ollama model: {OLLAMA_EMBED_MODEL}")
    print(f"   Ollama URL: {OLLAMA_URL}")

    # Example: uncomment when you have a real doc
    # processor.process_legal_image("sample_legal_document.jpg", metadata)


if __name__ == "__main__":
    main()
