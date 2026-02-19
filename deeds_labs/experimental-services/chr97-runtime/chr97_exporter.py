#!/usr/bin/env python3
"""
CHR97 Binary Cartridge Exporter
Reads PostgreSQL (consolidated) → writes pure binary CHR97 cartridge
"""
import struct
import json
import hashlib
from typing import List, Dict, Any, BinaryIO
from pathlib import Path
import psycopg2

# Import our C headers (would be compiled separately)
from chr97_runtime.chr97_rune import Chr97Rune, Chr97Header
from chr97_runtime.chr97_rune import CHR97_RUNE_SIZE, CHR97_HEADER_SIZE
from chr97_runtime.chr97_rune import CHR97_FLAG_IS_TEXT, CHR97_FLAG_HAS_CITES

class Chr97Exporter:
    def __init__(self, db_config: Dict[str, Any]):
        self.db_config = db_config

    def export_cartridge(self, case_id: str, output_path: str):
        """Export complete CHR97 binary cartridge for a case"""
        print(f"📦 Exporting CHR97 cartridge for case: {case_id}")

        # Load all rune data from PostgreSQL
        runes_data = self._load_runes_for_case(case_id)
        if not runes_data:
            raise ValueError(f"No rune data found for case {case_id}")

        # Prepare string pool
        string_pool, offsets = self._build_string_pool(runes_data)

        # Write binary file
        with open(output_path, 'wb') as f:
            self._write_header(f, len(runes_data), len(string_pool))
            self._write_runes(f, runes_data, offsets)
            self._write_string_pool(f, string_pool)

        print(f"✅ Exported {len(runes_data)} runes to {output_path}")
        print(f"   String pool: {len(string_pool)} bytes")

    def export_cartridge(self, case_id: str, output_path: str):
        """Export complete CHR97 binary cartridge for a case"""
        print(f"📦 Exporting CHR97 cartridge for case: {case_id}")

        # Load all rune data
        runes_data = self._load_runes_for_case(case_id)
        if not runes_data:
            raise ValueError(f"No rune data found for case {case_id}")

        # Prepare string pool
        string_pool, offsets = self._build_string_pool(runes_data)

        # Write binary file
        with open(output_path, 'wb') as f:
            self._write_header(f, len(runes_data), len(string_pool))
            self._write_runes(f, runes_data, offsets)
            self._write_string_pool(f, string_pool)

        print(f"✅ Exported {len(runes_data)} runes to {output_path}")
        print(f"   String pool: {len(string_pool)} bytes")

    def _load_runes_for_case(self, case_id: str) -> List[Dict[str, Any]]:
        """Load all rune data from consolidated PostgreSQL"""
        conn = psycopg2.connect(**self.db_config)
        cursor = conn.cursor()

        try:
            # Query embeddings and document data
            cursor.execute("""
                SELECT
                    e.id,
                    e.doc_id,
                    e.embedding,
                    e.chunk_text,
                    e.chunk_index,
                    e.metadata,
                    d.content,
                    d.metadata as doc_metadata
                FROM chr97_embeddings.document_embeddings e
                JOIN chr97_documents.legal_documents d ON e.doc_id = d.doc_id
                WHERE e.doc_id LIKE %s
                ORDER BY e.chunk_index
            """, (f"{case_id}%",))

            results = cursor.fetchall()

            runes = []
            for row in results:
                embedding_id, doc_id, embedding, chunk_text, chunk_index, metadata, content, doc_metadata = row

                # Parse metadata
                meta = metadata or {}
                doc_meta = doc_metadata or {}

                # Build rune dict
                rune = {
                    'id': embedding_id,
                    'case_id': case_id,
                    'case_id_hash': self._hash_string(case_id),
                    'chunk_index': chunk_index or 0,
                    'cluster_id': meta.get('cluster_id', 0),
                    'manifold': meta.get('manifold', [0.0, 0.0, 0.0, 0.0]),
                    'heat_u16': int(meta.get('heat', 0.5) * 65535),
                    'flags': self._compute_flags(meta),
                    'emb16': meta.get('emb16', [0.0] * 16),  # Assume projection already done
                    'tag': meta.get('tag', ''),
                    'label': meta.get('label', ''),
                    'image_meta': meta.get('image_meta', {}),
                    'saved_citations': meta.get('saved_citations', []),
                    'search_citations': meta.get('search_citations', [])
                }
                runes.append(rune)

            return runes

        finally:
            cursor.close()
            conn.close()

    def _hash_string(self, s: str) -> int:
        """Hash string to uint32"""
        return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)

    def _compute_flags(self, payload: Dict[str, Any]) -> int:
        """Compute flags bitfield"""
        flags = 0
        if payload.get('is_text', True):
            flags |= CHR97_FLAG_IS_TEXT
        if payload.get('is_image', False):
            flags |= CHR97_FLAG_IS_IMAGE
        if payload.get('saved_citations') or payload.get('search_citations'):
            flags |= CHR97_FLAG_HAS_CITES
        return flags

    def _build_string_pool(self, runes: List[Dict[str, Any]]) -> tuple[bytes, Dict[str, int]]:
        """Build string pool and return offsets"""
        strings = []
        offsets = {}

        for rune in runes:
            # Tag
            tag = rune['tag']
            if tag and tag not in offsets:
                offsets[tag] = len(strings)
                strings.append(tag.encode('utf-8') + b'\0')

            # Label
            label = rune['label']
            if label and label not in offsets:
                offsets[label] = len(strings)
                strings.append(label.encode('utf-8') + b'\0')

            # Image meta JSON
            if rune['image_meta']:
                meta_json = json.dumps(rune['image_meta'], separators=(',', ':'))
                if meta_json not in offsets:
                    offsets[meta_json] = len(strings)
                    strings.append(meta_json.encode('utf-8') + b'\0')

        return b''.join(strings), offsets

    def _write_header(self, f: BinaryIO, rune_count: int, string_pool_size: int):
        """Write Chr97Header"""
        header = Chr97Header()
        header.magic = b"CHR97BIN"
        header.version = 1
        header.rune_count = rune_count
        header.rune_stride = CHR97_RUNE_SIZE
        header.string_pool_offset = CHR97_HEADER_SIZE + (rune_count * CHR97_RUNE_SIZE)
        header.string_pool_size = string_pool_size

        f.write(struct.pack('<8sLLLLLL', *header.__dict__.values()))

    def _write_runes(self, f: BinaryIO, runes: List[Dict[str, Any]], string_offsets: Dict[str, int]):
        """Write all Chr97Rune structs"""
        for rune in runes:
            rune_struct = Chr97Rune()
            rune_struct.id = rune['id']
            rune_struct.case_id_hash = rune['case_id_hash']
            rune_struct.chunk_index = rune['chunk_index']
            rune_struct.cluster_id = rune['cluster_id']
            rune_struct.manifold = rune['manifold']
            rune_struct.heat_u16 = rune['heat_u16']
            rune_struct.flags = rune['flags']
            rune_struct.emb16 = rune['emb16']

            # String offsets
            rune_struct.tag_offset = string_offsets.get(rune['tag'], 0)
            rune_struct.tag_len = len(rune['tag'].encode('utf-8')) if rune['tag'] else 0
            rune_struct.label_offset = string_offsets.get(rune['label'], 0)
            rune_struct.label_len = len(rune['label'].encode('utf-8')) if rune['label'] else 0

            # Image meta
            meta_json = json.dumps(rune['image_meta'], separators=(',', ':')) if rune['image_meta'] else ''
            rune_struct.image_meta_offset = string_offsets.get(meta_json, 0)

            # Pack struct (this would use the actual C struct packing)
            # For now, pack manually
            data = struct.pack('<LLL4fHHH16fLLLLLL',
                rune_struct.id,
                rune_struct.case_id_hash,
                rune_struct.chunk_index,
                rune_struct.cluster_id,
                *rune_struct.manifold,
                rune_struct.heat_u16,
                rune_struct.flags,
                0,  # reserved0
                *rune_struct.emb16,
                rune_struct.tag_offset,
                rune_struct.tag_len,
                rune_struct.label_offset,
                rune_struct.label_len,
                rune_struct.image_meta_offset,
                0,  # reserved1
            )
            f.write(data)

    def _write_string_pool(self, f: BinaryIO, string_pool: bytes):
        """Write string pool"""
        f.write(string_pool)

def main():
    import sys
    if len(sys.argv) != 3:
        print("Usage: python chr97_exporter.py <case_id> <output.chr97>")
        sys.exit(1)

    case_id = sys.argv[1]
    output_path = sys.argv[2]

    exporter = Chr97Exporter(
        redis_url="redis://localhost:6379",
        qdrant_url="http://localhost:6333"
    )

    exporter.export_cartridge(case_id, output_path)

if __name__ == '__main__':
    main()