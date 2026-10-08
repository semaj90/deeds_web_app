"""Opt-in treesitter-chunker adapter. No canonical write, embedding or inferred revisions."""
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

@dataclass(frozen=True)
class Span:
    source_ref: str
    source_revision: str
    language: str
    node_type: str
    start_byte: int
    end_byte: int
    start_line: int
    end_line: int
    content_hash: str
    upstream_chunk_id: str

def normalize_chunks(source: bytes, source_ref: str, language: str, chunks) -> list[Span]:
    if not source_ref or not language or not isinstance(source, bytes):
        raise ValueError("INVALID_SOURCE")
    rev = "sha256:" + sha256(source).hexdigest()
    result = []
    for chunk in chunks:
        a, b = chunk.byte_start, chunk.byte_end
        if not isinstance(a, int) or not isinstance(b, int) or a < 0 or b <= a or b > len(source):
            raise ValueError("INVALID_BYTE_SPAN")
        raw = source[a:b]
        if raw.decode("utf-8") != chunk.content:
            raise ValueError("CONTENT_SPAN_MISMATCH")
        if chunk.language != language or not chunk.node_type:
            raise ValueError("CHUNK_LANGUAGE_MISMATCH")
        if chunk.start_line < 1 or chunk.end_line < chunk.start_line:
            raise ValueError("INVALID_LINE_SPAN")
        result.append(Span(source_ref, rev, language, chunk.node_type, a, b,
                           chunk.start_line, chunk.end_line, "sha256:" + sha256(raw).hexdigest(),
                           str(chunk.chunk_id)))
    return result

def chunk_source(source: bytes, source_ref: str, language: str) -> list[Span]:
    """Caller must provide exact source_ref; intentionally no fallback parser."""
    try:
        from chunker import chunk_text
    except ImportError as exc:
        raise RuntimeError("TREESITTER_CHUNKER_NOT_INSTALLED") from exc
    text = source.decode("utf-8")
    chunks = chunk_text(text, language=language, file_path=source_ref)
    return normalize_chunks(source, source_ref, language, chunks)

def chunk_file_snapshot(path: str, source_ref: str, language: str) -> list[Span]:
    source = Path(path).read_bytes()
    # Single in-memory snapshot for content hash/byte span consistency.
    return chunk_source(source, source_ref, language)
