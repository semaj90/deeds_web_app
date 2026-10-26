"""Read-only bounded JSONL graph extraction qualification; no canonical writes."""
from __future__ import annotations
import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

SCHEMA = 'atlas.graph-stream-batch.v1'

class GraphStreamError(ValueError):
    pass

@dataclass(frozen=True)
class Record:
    kind: str
    canonical_id: str
    source_revision: str
    graph_revision: str
    source_ref: str
    features: tuple[float, ...]


def parse_line(raw: bytes, number: int, max_record_bytes: int) -> Record:
    if len(raw) > max_record_bytes:
        raise GraphStreamError(f'line {number}: oversized record')
    try:
        item = json.loads(raw)
    except (UnicodeDecodeError, ValueError) as exc:
        raise GraphStreamError(f'line {number}: invalid JSON/UTF-8') from exc
    if not isinstance(item, dict):
        raise GraphStreamError(f'line {number}: expected object')
    required = ('kind', 'canonical_id', 'source_revision', 'graph_revision', 'source_ref')
    if any(not isinstance(item.get(k), str) or not item[k] for k in required):
        raise GraphStreamError(f'line {number}: missing identity or revision')
    if item['kind'] not in ('node', 'edge'):
        raise GraphStreamError(f'line {number}: unsupported kind')
    v = item.get('features', [])
    if not isinstance(v, list) or len(v) > 4096 or any(type(n) not in (float, int) or not (-1e30 < n < 1e30) for n in v):
        raise GraphStreamError(f'line {number}: invalid numeric features')
    return Record(*(item[k] for k in required), tuple(float(n) for n in v))


def iter_records(source: Path, max_record_bytes: int) -> Iterator[Record]:
    # A byte at a time would be slow; readline(limit) prevents a single huge line allocation.
    with source.open('rb', buffering=1024*1024) as fh:
        line_no = 0
        while True:
            raw = fh.readline(max_record_bytes + 1)
            if not raw:
                break
            line_no += 1
            if len(raw) > max_record_bytes or not raw.endswith(b'\n') and len(raw) == max_record_bytes + 1:
                raise GraphStreamError(f'line {line_no}: oversized record')
            if raw.strip():
                yield parse_line(raw, line_no, max_record_bytes)


def summarize(source: Path, batch_size: int = 256, max_record_bytes: int = 1_048_576):
    if batch_size < 1 or batch_size > 8192 or max_record_bytes < 256 or max_record_bytes > 16_777_216:
        raise ValueError('invalid bounded batch parameters')
    if not source.is_file():
        raise FileNotFoundError(source)
    h = hashlib.sha256()
    count = 0
    batches = 0
    feature_values = 0
    kinds = {'node': 0, 'edge': 0}
    current = []
    # Hash raw input separately: no parsed object retained across batches.
    with source.open('rb') as fh:
        for block in iter(lambda: fh.read(4*1024*1024), b''):
            h.update(block)
    for record in iter_records(source, max_record_bytes):
        current.append(record)
        count += 1
        kinds[record.kind] += 1
        feature_values += len(record.features)
        if len(current) >= batch_size:
            batches += 1
            current.clear()
    if current:
        batches += 1
    return {
        'schema': SCHEMA, 'status': 'CPU_STREAM_VALIDATED',
        'authority': 'derived-only', 'canonical_writes': False,
        'source_sha256': h.hexdigest(), 'records': count,
        'batches': batches, 'kinds': kinds, 'feature_values': feature_values,
        'batch_size': batch_size, 'max_record_bytes': max_record_bytes,
        'gpu_executed': False, 'qdrant_mutated': False,
        'note': 'JSONL only; no source/readback or edge endpoint proof',
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path, help='Independent JSON objects, one per line')
    p.add_argument('--batch-size', type=int, default=256)
    p.add_argument('--max-record-bytes', type=int, default=1_048_576)
    args = p.parse_args()
    print(json.dumps(summarize(args.source, args.batch_size, args.max_record_bytes), indent=2, sort_keys=True))

if __name__ == '__main__':
    main()
