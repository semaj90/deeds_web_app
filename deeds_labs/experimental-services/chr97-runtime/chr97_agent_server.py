#!/usr/bin/env python3
"""
CHR97 Agent gRPC Service - Pure binary cartridge server
"""
import grpc
from concurrent import futures
import time
import json
import hashlib
import psycopg2
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

import chr97_agent_pb2 as chr97_pb2
import chr97_agent_pb2_grpc as chr97_pb2_grpc

class Chr97AgentServicer(chr97_pb2_grpc.Chr97AgentServicer):
    def __init__(self, db_config: Dict[str, Any]):
        self.db_config = db_config

    def _case_id_to_hash(self, case_id: str) -> int:
        """Hash case_id to uint32"""
        return int(hashlib.md5(case_id.encode()).hexdigest()[:8], 16)

    def GetCartridge(self, request, context):
        """Stream CHR97 binary cartridge for a case"""
        case_id = request.case_id

        # Get runes from Redis/Qdrant
        rune_data = self._load_runes_for_case(case_id)
        edges = self._load_graph_edges(case_id)

        runes = []
        for rune in rune_data:
            # Pack Chr97Rune struct (128 bytes)
            header_bytes = self._pack_rune_header(rune)

            rune_pb = chr97_pb2.RuneBinary(
                header=header_bytes,
                tag=rune.get('tag', '').encode('utf-8'),
                label=rune.get('label', '').encode('utf-8'),
                image_meta=json.dumps(rune.get('image_meta', {})).encode('utf-8')
            )
            runes.append(rune_pb)

        graph_edges = []
        for edge in edges:
            graph_edges.append(chr97_pb2.GraphEdge(
                from_id=edge['from_id'],
                to_id=edge['to_id'],
                relation=edge['relation']
            ))

        return chr97_pb2.GetCartridgeResponse(
            runes=runes,
            edges=graph_edges
        )

    def QueryTags(self, request, context):
        """Query mirrored tags + citations"""
        query = request.query
        limit = request.limit or 10

        # Search Qdrant for semantic matches
        results = self.qdrant.search_tags(query, limit=limit)

        hits = []
        for result in results:
            payload = result.payload

            # Get citations from Redis
            citations = self._get_citations_for_rune(
                payload['case_id'],
                payload['chunk_index']
            )

            hit = chr97_pb2.TagHit(
                rune_id=result.id,
                case_id=payload['case_id'],
                chunk_index=payload['chunk_index'],
                tag=payload.get('tag', ''),
                label=payload.get('label', ''),
                saved_citations=citations.get('saved', []),
                search_citations=citations.get('search', [])
            )
            hits.append(hit)

        return chr97_pb2.TagQueryResponse(hits=hits)

    def GetTimeline(self, request, context):
        """Get agentic timeline + AI summary"""
        case_id = request.case_id
        user_id = request.user_id

        session_id = f"{case_id}:{user_id}"
        events = self._get_timeline_events(session_id)

        # Convert to protobuf
        timeline_events = []
        for event in events:
            timeline_events.append(chr97_pb2.TimelineEvent(
                id=event['id'],
                ts=event['ts'],
                kind=event['kind'],
                description=event.get('description', '')
            ))

        # Generate AI summary
        ai_summary = self._generate_timeline_summary(events)

        return chr97_pb2.TimelineResponse(
            events=timeline_events,
            ai_summary=ai_summary
        )

    def _load_runes_for_case(self, case_id: str) -> List[Dict[str, Any]]:
        """Load rune data from PostgreSQL"""
        conn = psycopg2.connect(**self.db_config)
        cursor = conn.cursor()

        try:
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

                meta = metadata or {}
                doc_meta = doc_metadata or {}

                rune = {
                    'id': embedding_id,
                    'case_id': case_id,
                    'chunk_index': chunk_index or 0,
                    'manifold': meta.get('manifold', [0.0, 0.0, 0.0, 0.0]),
                    'emb16': meta.get('emb16', [0.0] * 16),
                    'heat': meta.get('heat', 0.5),
                    'tag': meta.get('tag', ''),
                    'label': meta.get('label', ''),
                    'image_meta': meta.get('image_meta', {}),
                    'flags': 0  # Compute flags
                }
                runes.append(rune)

            return runes

        finally:
            cursor.close()
            conn.close()

    def _load_graph_edges(self, case_id: str) -> List[Dict[str, Any]]:
        """Load graph edges from Neo4j/Redis"""
        return []

    def _pack_rune_header(self, rune: Dict[str, Any]) -> bytes:
        """Pack rune dict into 128-byte Chr97Rune struct"""
        # This would use struct.pack to create the binary header
        # For now, return placeholder
        return b'\x00' * 128

    def _get_citations_for_rune(self, case_id: str, chunk_index: int) -> Dict[str, List[str]]:
        """Get saved/search citations from PostgreSQL"""
        conn = psycopg2.connect(**self.db_config)
        cursor = conn.cursor()

        try:
            cursor.execute("""
                SELECT citation_text, is_saved
                FROM chr97_metadata.citations
                WHERE doc_id LIKE %s
                ORDER BY is_saved DESC, relevance_score DESC
                LIMIT 50
            """, (f"{case_id}%",))

            results = cursor.fetchall()

            saved = []
            search = []

            for citation_text, is_saved in results:
                if is_saved:
                    saved.append(citation_text)
                else:
                    search.append(citation_text)

            return {'saved': saved, 'search': search}

        finally:
            cursor.close()
            conn.close()

    def _get_timeline_events(self, session_id: str) -> List[Dict[str, Any]]:
        """Get timeline events from PostgreSQL"""
        conn = psycopg2.connect(**self.db_config)
        cursor = conn.cursor()

        try:
            cursor.execute("""
                SELECT timeline
                FROM chr97_agent.agent_sessions
                WHERE session_id = %s
            """, (session_id,))

            row = cursor.fetchone()
            if row:
                timeline = row[0] or []
                return timeline
            return []

        finally:
            cursor.close()
            conn.close()

    def _generate_timeline_summary(self, events: List[Dict[str, Any]]) -> str:
        """Generate simple timeline summary"""
        if not events:
            return "No events recorded yet."

        event_count = len(events)
        last_event = events[-1] if events else None

        summary = f"Session has {event_count} events."
        if last_event:
            summary += f" Last activity: {last_event.get('kind', 'unknown')}"

        return summary

def serve():
    db_config = {
        'host': 'localhost',
        'port': 5432,
        'database': 'legal_db',
        'user': 'postgres',
        'password': 'password'
    }

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    chr97_pb2_grpc.add_Chr97AgentServicer_to_server(
        Chr97AgentServicer(db_config),
        server
    )
    server.add_insecure_port('[::]:50051')
    server.start()
    print("CHR97 Agent gRPC server started on port 50051")
    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)

if __name__ == '__main__':
    serve()