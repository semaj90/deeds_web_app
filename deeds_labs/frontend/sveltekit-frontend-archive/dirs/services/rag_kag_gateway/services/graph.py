"""
Graph Service - Knowledge graph expansion for KAG
Handles adjacency traversal from knowledge_graph table
"""
import psycopg
import sys
sys.path.append('..')
from config import PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE


def _get_conn_str():
    return f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DATABASE}"


async def expand_graph(
    seed_ids: list[str],
    depth: int = 1,
    edge_types: list[str] | None = None,
    limit: int = 50
) -> dict:
    """
    Expand knowledge graph from seed nodes
    Returns neighboring nodes and edges up to specified depth
    """
    nodes = {}
    edges = []

    conn_str = _get_conn_str()

    try:
        async with await psycopg.AsyncConnection.connect(conn_str) as conn:
            async with conn.cursor() as cur:
                # Get edges from seed nodes
                sql = """
                    SELECT id, source_type, source_name, target_type, target_name,
                           relationship, confidence, metadata
                    FROM knowledge_graph
                    WHERE source_name = ANY($1::text[])
                       OR target_name = ANY($1::text[])
                    LIMIT $2
                """

                current_seeds = seed_ids

                for d in range(depth):
                    await cur.execute(sql, (current_seeds, limit))
                    rows = await cur.fetchall()

                    next_seeds = []
                    for row in rows:
                        edge = {
                            "id": row[0],
                            "source": {"type": row[1], "name": row[2]},
                            "target": {"type": row[3], "name": row[4]},
                            "relationship": row[5],
                            "confidence": row[6],
                            "metadata": row[7]
                        }

                        # Filter by edge types if specified
                        if edge_types and row[5] not in edge_types:
                            continue

                        edges.append(edge)

                        # Track nodes
                        nodes[row[2]] = {"type": row[1], "name": row[2]}
                        nodes[row[4]] = {"type": row[3], "name": row[4]}

                        # Collect next level seeds
                        if row[2] not in current_seeds:
                            next_seeds.append(row[2])
                        if row[4] not in current_seeds:
                            next_seeds.append(row[4])

                    current_seeds = next_seeds[:limit]
                    if not current_seeds:
                        break

    except Exception as e:
        return {"error": str(e), "nodes": [], "edges": []}

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "depth": depth,
        "seed_count": len(seed_ids)
    }


async def get_context(
    error_id: str,
    file_path: str | None = None,
    error_code: str | None = None
) -> dict:
    """
    Get graph-derived context for an error
    Returns related patterns, fixes, and file dependencies
    """
    context = {
        "patterns": [],
        "related_fixes": [],
        "file_deps": [],
        "same_file_errors": []
    }

    conn_str = _get_conn_str()

    try:
        async with await psycopg.AsyncConnection.connect(conn_str) as conn:
            async with conn.cursor() as cur:
                # Get patterns matching this error
                pattern_sql = """
                    SELECT target_name, confidence, metadata
                    FROM knowledge_graph
                    WHERE source_name LIKE $1
                      AND relationship = 'matches_pattern'
                    ORDER BY confidence DESC
                    LIMIT 5
                """
                await cur.execute(pattern_sql, (f"%{error_code or ''}%",))
                rows = await cur.fetchall()
                context["patterns"] = [
                    {"pattern": row[0], "confidence": row[1], "meta": row[2]}
                    for row in rows
                ]

                # Get same-file errors if file_path provided
                if file_path:
                    same_file_sql = """
                        SELECT id, error_code, error_message, line_number
                        FROM ts_errors
                        WHERE file_path = $1
                          AND id != $2
                        LIMIT 10
                    """
                    error_id_int = int(error_id) if error_id.isdigit() else 0
                    await cur.execute(same_file_sql, (file_path, error_id_int))
                    rows = await cur.fetchall()
                    context["same_file_errors"] = [
                        {"id": row[0], "code": row[1], "message": row[2][:100] if row[2] else None, "line": row[3]}
                        for row in rows
                    ]

    except Exception as e:
        context["error"] = str(e)

    return context
