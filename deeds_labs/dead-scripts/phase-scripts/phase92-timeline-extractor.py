#!/usr/bin/env python3
"""
Phase 92: LangExtract Timeline Event Extractor
Transforms unstructured ACE logs → structured timeline events → Postgres + Qdrant

Architecture:
  ACE logs → LangExtract /extract → Parse entities → Normalize tags → Write events

Usage:
    python scripts/phase92-timeline-extractor.py --log-file reports/ace-synthesis.log
    python scripts/phase92-timeline-extractor.py --redis-pattern "phase89:chunk:*" --limit 100
    python scripts/phase92-timeline-extractor.py --analyze-only
"""

import argparse
import asyncio
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

import httpx
import redis.asyncio as aioredis
from tqdm import tqdm

# Add scripts dir to path
sys.path.insert(0, str(Path(__file__).parent))

# Import event sourcing
try:
    from phase92_event_sourcing import EventSourcingEngine
except ImportError:
    # Fallback: import from scripts directory
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "phase92_event_sourcing",
        Path(__file__).parent / "phase92-event-sourcing.py"
    )
    phase92_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(phase92_module)
    EventSourcingEngine = phase92_module.EventSourcingEngine

# Import JSON helper
from phase89_json import loads_str, dumps

# =============================================================================
# Configuration
# =============================================================================
POSTGRES_DSN = "postgresql://user:pass@localhost:5434/legal"
QDRANT_URL = "http://127.0.0.1:6333"
REDIS_URL = "redis://127.0.0.1:6379"
LANGEXTRACT_URL = "http://localhost:8095"
LANGEXTRACT_URL = "http://localhost:8095"
REDIS_HOST = "localhost"
REDIS_PORT = 6379

# LangExtract config
LANGEXTRACT_CONFIG = {
    'document_type': 'code',  # code analysis mode
    'extract_entities': True,
    'extract_structure': True,
    'language': 'en'
}

# Canonical tag mappings (from ACE_FINAL_FORM_ARCHITECTURE.md)
FEATURE_TAG_ALIASES = {
    'svelte': ['svelte5', 'sveltekit', 'svelte-kit'],
    'react': ['reactjs', 'react-hooks', 'jsx'],
    'typescript': ['ts', 'tsx', 'type-checking'],
    'docker': ['dockerfile', 'docker-compose', 'containers'],
    'database': ['db', 'postgres', 'postgresql', 'prisma'],
    'api': ['rest', 'endpoint', 'route-handler'],
    'auth': ['authentication', 'authorization', 'lucia'],
    'rag': ['retrieval', 'embedding', 'qdrant', 'vector-search'],
    'cache': ['redis', 'caching', 'memoization'],
    'validation': ['langextract', 'tsc', 'type-check']
}

ERROR_TAG_ALIASES = {
    'ts2304': ['cannot-find-name', 'undefined-var'],
    'ts2345': ['argument-type-mismatch', 'incompatible-types'],
    'ts2322': ['type-not-assignable', 'assignment-error'],
    'ts7006': ['implicit-any', 'missing-type'],
    'svelte-parse': ['svelte-syntax-error', 'template-error']
}

# =============================================================================
# Tag Normalization
# =============================================================================
def normalize_tags(raw_tags: List[str], alias_map: Dict[str, List[str]]) -> List[str]:
    """
    Normalize tags using canonical alias map.

    Example:
        ["svelte5", "reactjs"] → ["svelte", "react"]
    """
    canonical = []
    seen = set()

    for tag in raw_tags:
        tag_lower = tag.lower().strip()

        # Check if tag is an alias
        for canonical_name, aliases in alias_map.items():
            if tag_lower == canonical_name or tag_lower in aliases:
                if canonical_name not in seen:
                    canonical.append(canonical_name)
                    seen.add(canonical_name)
                break
        else:
            # Not an alias, use as-is (if not already seen)
            if tag_lower not in seen:
                canonical.append(tag_lower)
                seen.add(tag_lower)

    return canonical

# =============================================================================
# Log Pattern Extraction
# =============================================================================
def extract_log_patterns(log_text: str) -> Dict[str, any]:
    """
    Extract structured info from ACE log text using regex patterns.

    Patterns:
        - Timestamps: 2025-12-29T16:21:05Z
        - Operations: upsert|delete|patch
        - Collections: phase89_*
        - Redis keys: phase89:chunk:*
        - Error codes: TS2304, SVELTE5001
        - Files: src/lib/components/Button.svelte
    """

    result = {
        'ts': None,
        'op': None,
        'collection': None,
        'redis_key_ref': None,
        'file_path': None,
        'error_codes': [],
        'feature_mentions': [],
        'confidence': 0.5  # default low confidence
    }

    # Timestamp (ISO 8601)
    ts_match = re.search(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)', log_text)
    if ts_match:
        result['ts'] = ts_match.group(1)
        result['confidence'] += 0.1

    # Operation
    op_match = re.search(r'\b(upsert|delete|patch|create|update)\b', log_text, re.IGNORECASE)
    if op_match:
        result['op'] = op_match.group(1).lower()
        result['confidence'] += 0.1

    # Collection
    coll_match = re.search(r'phase89_([a-z_]+)', log_text)
    if coll_match:
        result['collection'] = f"phase89_{coll_match.group(1)}"
        result['confidence'] += 0.1

    # Redis key
    redis_match = re.search(r'phase89:(chunk|embedding|cluster|summary):[^\s]+', log_text)
    if redis_match:
        result['redis_key_ref'] = redis_match.group(0)
        result['confidence'] += 0.1

    # File path
    file_match = re.search(r'(?:src|lib)/[^\s:]+\.(ts|svelte|js|tsx|jsx)', log_text)
    if file_match:
        result['file_path'] = file_match.group(0)
        result['confidence'] += 0.1

    # Error codes (TS*, SVELTE*)
    error_codes = re.findall(r'\b(TS\d{4}|SVELTE\d{4})\b', log_text, re.IGNORECASE)
    if error_codes:
        result['error_codes'] = [e.upper() for e in error_codes]
        result['confidence'] += 0.1

    # Feature mentions
    feature_keywords = ['svelte', 'react', 'typescript', 'docker', 'redis', 'qdrant', 'langextract']
    for keyword in feature_keywords:
        if keyword in log_text.lower():
            result['feature_mentions'].append(keyword)

    return result

# =============================================================================
# LangExtract Integration
# =============================================================================
async def extract_with_langextract(
    text: str,
    document_type: str = 'code'
) -> Optional[Dict]:
    """
    Call LangExtract /extract endpoint to get structured entities.

    Returns:
        {
            'entities': [...],
            'structure': {...},
            'language': 'en'
        }
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{LANGEXTRACT_URL}/extract",
                json={
                    'content': text,
                    'document_type': document_type,
                    'extract_entities': True,
                    'extract_structure': True,
                    'language': 'en'
                }
            )

            if response.status_code != 200:
                print(f"⚠️  LangExtract error: {response.status_code}")
                return None

            return response.json()

    except Exception as e:
        print(f"⚠️  LangExtract failed: {e}")
        return None

def merge_langextract_entities(
    patterns: Dict,
    langextract_result: Optional[Dict]
) -> Tuple[List[str], List[str]]:
    """
    Merge pattern extraction + LangExtract entities → feature_tags + error_tags.

    Returns:
        (feature_tags, error_tags)
    """
    feature_tags = set(patterns.get('feature_mentions', []))
    error_tags = set()

    # Add error codes as tags
    for code in patterns.get('error_codes', []):
        error_tags.add(code.lower())

    # If LangExtract available, extract entities
    if langextract_result:
        entities = langextract_result.get('entities', [])

        for entity in entities:
            entity_type = entity.get('type', '').lower()
            entity_text = entity.get('text', '').lower()

            # Map entity types to tags
            if entity_type in ['technology', 'framework', 'library']:
                feature_tags.add(entity_text)
            elif entity_type in ['error', 'issue', 'bug']:
                error_tags.add(entity_text)

    # Normalize using canonical aliases
    feature_tags = normalize_tags(list(feature_tags), FEATURE_TAG_ALIASES)
    error_tags = normalize_tags(list(error_tags), ERROR_TAG_ALIASES)

    return feature_tags, error_tags

# =============================================================================
# Timeline Event Creation
# =============================================================================
async def create_timeline_event(
    log_text: str,
    actor: str = 'phase92-timeline-extractor',
    use_langextract: bool = True
) -> Optional[Dict]:
    """
    Transform log text → timeline event.

    Returns event dict or None if insufficient data.
    """

    # Step 1: Pattern extraction
    patterns = extract_log_patterns(log_text)

    if not patterns['op'] or not patterns['collection']:
        # Insufficient data
        return None

    # Step 2: LangExtract (optional)
    langextract_result = None
    if use_langextract:
        langextract_result = await extract_with_langextract(log_text)

    # Step 3: Merge entities → tags
    feature_tags, error_tags = merge_langextract_entities(patterns, langextract_result)

    # Step 4: Build event
    event_id = str(uuid4())

    # Hash signature for deduplication
    signature_text = f"{patterns['op']}:{patterns['collection']}:{patterns.get('redis_key_ref', '')}"
    vector_hash = hashlib.sha256(signature_text.encode()).hexdigest()

    # Build notes (first 200 chars of log)
    notes = log_text[:200].strip()

    event = {
        'event_id': event_id,
        'ts': patterns.get('ts') or datetime.utcnow().isoformat() + 'Z',
        'actor': actor,
        'op': patterns['op'],
        'collection': patterns['collection'],
        'point_id': None,  # Will be set by caller if known
        'vector_hash': vector_hash,
        'payload_hash': None,
        'redis_key_ref': patterns.get('redis_key_ref'),
        'diff_json': None,
        'run_id': None,
        'feature_tags': feature_tags,
        'error_tags': error_tags,
        'file_path': patterns.get('file_path'),
        'notes': notes,
        'confidence': patterns['confidence']
    }

    return event

# =============================================================================
# Batch Processing
# =============================================================================
async def process_log_file(
    log_path: str,
    actor: str,
    use_langextract: bool = True,
    dry_run: bool = False
) -> int:
    """
    Process ACE log file → timeline events.

    Returns: number of events created
    """

    print(f"📄 Processing log file: {log_path}")
    print()

    # Read log file
    log_path_obj = Path(log_path)
    if not log_path_obj.exists():
        print(f"❌ File not found: {log_path}")
        return 0

    log_text = log_path_obj.read_text(encoding='utf-8', errors='replace')

    # Split into chunks (by newline or timestamp)
    # Simple approach: split by double newline
    chunks = re.split(r'\n\s*\n', log_text)

    print(f"📦 Found {len(chunks)} log chunks")
    print()

    # Create event logger
    if not dry_run:
        # config = EventConfig()
        event_logger = EventSourcingEngine(postgres_dsn=POSTGRES_DSN, qdrant_url=QDRANT_URL, redis_url=REDIS_URL, langextract_url=LANGEXTRACT_URL)
        await event_logger.connect()

    # Process chunks
    events_created = 0

    for chunk in tqdm(chunks, desc="Extracting events"):
        if len(chunk.strip()) < 20:
            continue  # Skip empty/tiny chunks

        # Create event
        event = await create_timeline_event(chunk, actor, use_langextract)

        if not event:
            continue

        if dry_run:
            # Just print
            print(f"  Event: {event['op']} on {event['collection']}")
            print(f"    Tags: feature={event['feature_tags']}, error={event['error_tags']}")
            print()
        else:
            # Log to Postgres + Qdrant
            await event_logger.log_event(**event)
            events_created += 1

    if not dry_run:
        await event_logger.close()

    print()
    print(f"✅ Created {events_created} timeline events")

    return events_created

async def process_redis_keys(
    pattern: str,
    actor: str,
    limit: int = 100,
    use_langextract: bool = True,
    dry_run: bool = False
) -> int:
    """
    Process Redis keys → timeline events (for decoded blobs).

    Returns: number of events created
    """

    print(f"🔍 Processing Redis keys: {pattern}")
    print()

    # Connect to Redis
    r = await aioredis.from_url(f"redis://{REDIS_HOST}:{REDIS_PORT}")

    # Scan keys
    keys = []
    async for key in r.scan_iter(match=pattern):
        keys.append(key.decode('utf-8'))
        if len(keys) >= limit:
            break

    print(f"📦 Found {len(keys)} keys")
    print()

    # Create event logger
    if not dry_run:
        # config = EventConfig()
        event_logger = EventSourcingEngine(postgres_dsn=POSTGRES_DSN, qdrant_url=QDRANT_URL, redis_url=REDIS_URL, langextract_url=LANGEXTRACT_URL)
        await event_logger.connect()

    # Process keys
    events_created = 0

    for key in tqdm(keys, desc="Extracting events"):
        # Get value
        value = await r.get(key)
        if not value:
            continue

        # Decode
        try:
            value_str = value.decode('utf-8', errors='replace')
        except:
            continue

        # Create log text
        log_text = f"Redis key: {key}\nValue: {value_str[:200]}"

        # Create event
        event = await create_timeline_event(log_text, actor, use_langextract)

        if not event:
            continue

        # Override redis_key_ref
        event['redis_key_ref'] = key

        if dry_run:
            print(f"  Event: {event['op']} on {event['collection']}")
            print(f"    Redis key: {key}")
            print()
        else:
            await event_logger.log_event(**event)
            events_created += 1

    await r.close()

    if not dry_run:
        await event_logger.close()

    print()
    print(f"✅ Created {events_created} timeline events")

    return events_created

# =============================================================================
# CLI
# =============================================================================
async def main():
    parser = argparse.ArgumentParser(description='Phase 92: LangExtract Timeline Event Extractor')
    parser.add_argument('--log-file', help='ACE log file to process')
    parser.add_argument('--redis-pattern', help='Redis key pattern to process')
    parser.add_argument('--limit', type=int, default=100, help='Max Redis keys to process')
    parser.add_argument('--actor', default='phase92-timeline-extractor', help='Actor name for events')
    parser.add_argument('--no-langextract', action='store_true', help='Skip LangExtract (regex only)')
    parser.add_argument('--dry-run', action='store_true', help='Test without writing to database')
    parser.add_argument('--analyze-only', action='store_true', help='Show stats without processing')

    args = parser.parse_args()

    use_langextract = not args.no_langextract

    if args.analyze_only:
        print("📊 Timeline Extractor Configuration:")
        print(f"   LangExtract URL: {LANGEXTRACT_URL}")
        print(f"   Feature tag aliases: {len(FEATURE_TAG_ALIASES)}")
        print(f"   Error tag aliases: {len(ERROR_TAG_ALIASES)}")
        print()
        print("   Supported operations: upsert, delete, patch, create, update")
        print("   Supported collections: phase89_*")
        print()
        return

    if args.log_file:
        await process_log_file(
            args.log_file,
            args.actor,
            use_langextract,
            args.dry_run
        )
    elif args.redis_pattern:
        await process_redis_keys(
            args.redis_pattern,
            args.actor,
            args.limit,
            use_langextract,
            args.dry_run
        )
    else:
        print("❌ Must specify --log-file or --redis-pattern")
        parser.print_help()

if __name__ == "__main__":
    asyncio.run(main())
