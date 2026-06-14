#!/usr/bin/env python3
"""
Parent Atlas: Embed Postgres Packets → Qdrant

Pipeline:
1. Fetch atlas_packets from Postgres
2. Normalize text (bounded)
3. Embed via Ollama embeddinggemma:latest
4. Create/configure Qdrant collection with named vectors + payload indexes
5. Batch upsert points (stable IDs from packet_key hash)
6. Coverage report

Hard rules:
- Stable IDs: hash(packet_key), not sequential
- Named vectors: "content" (required), "summary" (optional)
- Payload contract: packet_key, source_ref, feature_id, feature_label, packet_universe, domain_class, community_id, tags, metadata
- Payload indexes before upsert (Qdrant optimization)
- Batch upserts (not one-by-one)
- Dimension guard (check embedding length)
- Correct Ollama endpoint: http://localhost:11434
- Use embeddinggemma:latest (not qwen3)
"""

import hashlib
import json
import logging
import os
import sys
from typing import Optional

import ollama
import psycopg2
import psycopg2.extras
from qdrant_client import QdrantClient, models

# Configuration
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = "embeddinggemma:latest"
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")

COLLECTION_NAME = "codebase_chunks_768"
BATCH_SIZE = 32
MAX_TEXT_LENGTH = 8192
EXPECTED_EMBEDDING_DIM = 768

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def stable_id(packet_key: str) -> int:
    """Generate stable point ID from packet_key via SHA256 hash."""
    hash_bytes = hashlib.sha256(packet_key.encode()).digest()
    return int.from_bytes(hash_bytes[:8], byteorder="big")


def fetch_packets_from_postgres() -> list[dict]:
    """Fetch atlas_packets from Postgres."""
    logger.info(f"Connecting to Postgres: {DATABASE_URL.split('@')[1]}")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    query = """
    SELECT
      packet_key,
      source_ref,
      feature_id,
      feature_label,
      packet_universe,
      COALESCE(group_id, 'uncategorized') as domain_class,
      COALESCE(community_id, 'uncategorized') as community_id,
      metadata
    FROM atlas_packets
    WHERE packet_universe = 'atlas'
    AND source_ref IS NOT NULL
    ORDER BY packet_key
    """

    cur.execute(query)
    packets = [dict(row) for row in cur.fetchall()]
    conn.close()

    logger.info(f"Fetched {len(packets)} packets from Postgres")
    return packets


def get_text_for_embedding(packet: dict) -> str:
    """Extract and normalize text for embedding."""
    # Use feature_label as primary text
    text = packet.get("feature_label", "")

    # Add source_ref for context
    if packet.get("source_ref"):
        text += f" {packet['source_ref']}"

    # Add tags from metadata if available
    if packet.get("metadata"):
        try:
            metadata = json.loads(packet["metadata"]) if isinstance(packet["metadata"], str) else packet["metadata"]
            if "tags" in metadata:
                tags = metadata["tags"]
                if isinstance(tags, list):
                    text += " " + " ".join(tags)
        except (json.JSONDecodeError, TypeError):
            pass

    # Normalize and bound
    text = text.strip()
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH]

    return text


def create_qdrant_collection(qclient: QdrantClient, embedding_dim: int):
    """Create Qdrant collection with named vectors and payload indexes."""
    if qclient.collection_exists(COLLECTION_NAME):
        logger.info(f"Collection '{COLLECTION_NAME}' already exists")
        return

    logger.info(f"Creating Qdrant collection '{COLLECTION_NAME}' with {embedding_dim}-dim vectors")

    # Create collection with named vectors
    qclient.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config={
            "content": models.VectorParams(
                size=embedding_dim,
                distance=models.Distance.COSINE
            )
        }
    )

    # Create payload indexes (before large upserts)
    logger.info("Creating payload indexes...")

    payload_indexes = [
        ("packet_key", models.PayloadSchemaType.Keyword),
        ("source_ref", models.PayloadSchemaType.Keyword),
        ("feature_id", models.PayloadSchemaType.Keyword),
        ("feature_label", models.PayloadSchemaType.Text),
        ("packet_universe", models.PayloadSchemaType.Keyword),
        ("domain_class", models.PayloadSchemaType.Keyword),
        ("community_id", models.PayloadSchemaType.Keyword),
        ("tags", models.PayloadSchemaType.Keyword),
    ]

    for field_name, field_type in payload_indexes:
        try:
            qclient.create_payload_index(
                collection_name=COLLECTION_NAME,
                field_name=field_name,
                field_schema=field_type
            )
            logger.info(f"  ✓ Indexed {field_name}")
        except Exception as e:
            logger.warning(f"  ✗ Failed to index {field_name}: {e}")

    logger.info("Collection creation and indexing complete")


def embed_batch(
    oclient: ollama.Client,
    packets: list[dict],
    start_idx: int,
    end_idx: int
) -> list[tuple[int, list[float], dict]]:
    """Embed a batch of packets via Ollama."""
    batch = packets[start_idx:end_idx]
    embeddings = []

    for packet in batch:
        try:
            text = get_text_for_embedding(packet)

            response = oclient.embeddings(
                model=OLLAMA_MODEL,
                prompt=text
            )

            embedding = response.get("embedding", [])

            if not embedding or len(embedding) != EXPECTED_EMBEDDING_DIM:
                logger.warning(
                    f"Unexpected embedding dimension: {len(embedding)} != {EXPECTED_EMBEDDING_DIM} "
                    f"for {packet['packet_key']}"
                )
                continue

            # Prepare payload
            metadata = packet.get("metadata")
            if isinstance(metadata, str):
                try:
                    metadata = json.loads(metadata)
                except json.JSONDecodeError:
                    metadata = {}

            payload = {
                "packet_key": packet["packet_key"],
                "source_ref": packet["source_ref"],
                "feature_id": packet["feature_id"],
                "feature_label": packet["feature_label"],
                "packet_universe": packet["packet_universe"],
                "domain_class": packet["domain_class"],
                "community_id": packet["community_id"],
                "tags": metadata.get("tags", []) if isinstance(metadata, dict) else [],
                "metadata": {
                    "embedding_model": OLLAMA_MODEL,
                    "cosine_norm": True,
                    "text_for_embedding": get_text_for_embedding(packet)[:256]
                }
            }

            point_id = stable_id(packet["packet_key"])
            embeddings.append((point_id, embedding, payload))

        except Exception as e:
            logger.error(f"Failed to embed {packet['packet_key']}: {e}")
            continue

    return embeddings


def batch_upsert_to_qdrant(
    qclient: QdrantClient,
    points: list[tuple[int, list[float], dict]]
):
    """Batch upsert points to Qdrant."""
    if not points:
        return 0

    qdrant_points = [
        models.PointStruct(
            id=point_id,
            vector={"content": embedding},
            payload=payload
        )
        for point_id, embedding, payload in points
    ]

    try:
        qclient.upsert(
            collection_name=COLLECTION_NAME,
            points=qdrant_points
        )
        logger.info(f"✓ Upserted {len(qdrant_points)} points to Qdrant")
        return len(qdrant_points)
    except Exception as e:
        logger.error(f"Failed to upsert batch: {e}")
        return 0


def verify_dimension(oclient: ollama.Client) -> int:
    """Verify embedding dimension by generating a test embedding."""
    logger.info(f"Verifying embedding dimension via {OLLAMA_MODEL}...")

    try:
        response = oclient.embeddings(
            model=OLLAMA_MODEL,
            prompt="test"
        )

        embedding = response.get("embedding", [])
        dim = len(embedding)

        if dim != EXPECTED_EMBEDDING_DIM:
            logger.error(f"Unexpected embedding dimension: {dim} != {EXPECTED_EMBEDDING_DIM}")
            sys.exit(1)

        logger.info(f"✓ Embedding dimension verified: {dim}")
        return dim
    except Exception as e:
        logger.error(f"Failed to verify embedding dimension: {e}")
        sys.exit(1)


def generate_report(total_packets: int, embedded: int, coverage_pct: float):
    """Generate coverage report."""
    report = {
        "timestamp": __import__("datetime").datetime.now().isoformat(),
        "collection": COLLECTION_NAME,
        "ollama_model": OLLAMA_MODEL,
        "ollama_host": OLLAMA_HOST,
        "qdrant_host": f"{QDRANT_HOST}:{QDRANT_PORT}",
        "total_packets": total_packets,
        "embedded": embedded,
        "coverage_pct": coverage_pct,
    }

    # Write JSON report
    report_path = "docs/reports/parent-atlas-qdrant-embedding.json"
    os.makedirs(os.path.dirname(report_path), exist_ok=True)

    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    logger.info(f"Report written to {report_path}")

    # Write Markdown report
    md_path = "docs/reports/parent-atlas-qdrant-embedding.md"

    with open(md_path, "w") as f:
        f.write("# Parent Atlas → Qdrant Embedding Report\n\n")
        f.write(f"**Generated**: {report['timestamp']}\n\n")
        f.write(f"## Configuration\n\n")
        f.write(f"- **Ollama Model**: {report['ollama_model']}\n")
        f.write(f"- **Ollama Host**: {report['ollama_host']}\n")
        f.write(f"- **Qdrant**: {report['qdrant_host']}\n")
        f.write(f"- **Collection**: {report['collection']}\n\n")
        f.write(f"## Coverage\n\n")
        f.write(f"- **Total Packets**: {report['total_packets']}\n")
        f.write(f"- **Embedded**: {report['embedded']}\n")
        f.write(f"- **Coverage**: {report['coverage_pct']:.1f}%\n\n")
        f.write(f"## Next Steps\n\n")
        f.write(f"1. Verify Qdrant collection: `curl http://localhost:6333/collections`\n")
        f.write(f"2. Test search: `npm run atlas:retrieval:e2e`\n")
        f.write(f"3. Enrich payload with 4D topology: `npm run atlas:topology:verify`\n")

    logger.info(f"Markdown report written to {md_path}")


def main():
    """Main pipeline."""
    logger.info("=== Parent Atlas: Postgres → Ollama → Qdrant ===\n")

    # 1. Connect to services
    logger.info("Connecting to Ollama...")
    oclient = ollama.Client(host=OLLAMA_HOST)

    logger.info(f"Connecting to Qdrant: {QDRANT_HOST}:{QDRANT_PORT}...")
    qclient = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    # 2. Verify embedding dimension
    embedding_dim = verify_dimension(oclient)

    # 3. Create Qdrant collection with indexes
    create_qdrant_collection(qclient, embedding_dim)

    # 4. Fetch packets from Postgres
    packets = fetch_packets_from_postgres()

    if not packets:
        logger.error("No packets found in Postgres")
        sys.exit(1)

    # 5. Batch embed and upsert
    logger.info(f"\nEmbedding {len(packets)} packets in batches of {BATCH_SIZE}...")

    total_embedded = 0

    for batch_start in range(0, len(packets), BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, len(packets))
        batch_num = (batch_start // BATCH_SIZE) + 1
        total_batches = (len(packets) + BATCH_SIZE - 1) // BATCH_SIZE

        logger.info(f"\n[Batch {batch_num}/{total_batches}] Embedding packets {batch_start}-{batch_end}...")

        # Embed batch
        embeddings = embed_batch(oclient, packets, batch_start, batch_end)

        if embeddings:
            # Upsert batch to Qdrant
            upserted = batch_upsert_to_qdrant(qclient, embeddings)
            total_embedded += upserted
        else:
            logger.warning(f"No valid embeddings in batch {batch_num}")

    # 6. Generate report
    coverage_pct = (total_embedded / len(packets)) * 100 if packets else 0
    logger.info(f"\n=== Summary ===")
    logger.info(f"Total packets: {len(packets)}")
    logger.info(f"Embedded: {total_embedded}")
    logger.info(f"Coverage: {coverage_pct:.1f}%")

    generate_report(len(packets), total_embedded, coverage_pct)

    logger.info("\n✅ Parent Atlas embedding complete")


if __name__ == "__main__":
    main()
