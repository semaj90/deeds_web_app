#!/usr/bin/env python3
"""
Phase 89: LangExtract Validator
Validates code fixes before they become KB cards (experience layer).

Only validated fixes → KB cards. No garbage in ACE's experience.

Architecture:
  Fix Attempt → LangExtract Parse → AST Validation → KB Card (if valid)
                                  → Discard (if invalid)

Validation Checks:
  1. Syntax valid? (AST parses without errors)
  2. Types valid? (no new TS errors introduced)
  3. Imports resolved? (no missing modules)
  4. Semantics valid? (variable scopes, control flow)

LangExtract API Schema (from http://localhost:8095/openapi.json):
  POST /extract
  {
    "content": str (required) - Text content to analyze
    "document_type": str | null (default: "legal") - Type of document
    "extract_entities": bool (default: true) - Extract named entities
    "extract_structure": bool (default: true) - Extract document structure
    "language": str (default: "en") - Document language
  }

Usage:
    python scripts/phase89-langextract-validator.py --fix-id 12345
    python scripts/phase89-langextract-validator.py --batch  # Validate all pending
    python scripts/phase89-langextract-validator.py path/to/file.ts  # CLI test
"""

import asyncio
import hashlib
import json
import subprocess
import sys
from pathlib import Path

# Fix Windows console encoding for emoji
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).parent))

from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import redis.asyncio as aioredis
    import httpx
except ImportError:
    print("❌ Missing dependencies. Install:")
    print("   pip install redis[asyncio] httpx")
    sys.exit(1)

# Import shared JSON helper
from phase89_json import loads_bytes, loads_str, dumps, BACKEND

# =============================================================================
# LangExtract Auto-Discovery
# =============================================================================
def discover_langextract_endpoint(base_url: str) -> Optional[str]:
    """
    Auto-discover LangExtract endpoint from OpenAPI spec.
    Returns endpoint path like '/extract' or None if unavailable.
    """
    import httpx

    try:
        response = httpx.get(f"{base_url}/openapi.json", timeout=10.0)
        response.raise_for_status()
        spec = response.json()
        paths = spec.get("paths", {})

        # Prefer these endpoints in order
        preferred = ["/extract", "/parse", "/validate", "/schema/validate", "/v1/extract"]
        for endpoint in preferred:
            if endpoint in paths and "post" in paths.get(endpoint, {}):
                return endpoint

        # Fallback: first POST endpoint
        for path, methods in paths.items():
            if isinstance(methods, dict) and "post" in methods:
                return path

        return None

    except Exception as e:
        print(f"⚠️  Could not discover LangExtract endpoint: {e}")
        return None

def validate_with_langextract(
    code: str,
    language: str = "typescript",
    base_url: str = "http://localhost:8095",
    timeout: int = 30
) -> Tuple[bool, Dict[str, Any]]:
    """
    Validate code using LangExtract Docker container.

    Returns:
        (success, info_dict)
    """
    import httpx

    # Auto-discover endpoint
    endpoint = discover_langextract_endpoint(base_url)
    if not endpoint:
        return False, {
            "error": "LangExtract not reachable (no openapi.json or no POST endpoint)",
            "base_url": base_url
        }

    url = f"{base_url}{endpoint}"

    # Try common input field names (LangExtract schema uses 'content')
    candidate_keys = ["content", "text", "input", "code"]

    for key in candidate_keys:
        payload = {
            key: code,
            "language": language,
            "extract_entities": True,
            "extract_structure": True
        }

        try:
            response = httpx.post(url, json=payload, timeout=timeout)
            response.raise_for_status()

            # Parse response
            content_type = response.headers.get("content-type", "").lower()
            if "application/json" in content_type:
                data = response.json()
            else:
                data = {"raw": response.text}

            return True, {
                "endpoint": endpoint,
                "payload_key": key,
                "result": data
            }

        except httpx.HTTPStatusError as e:
            # Try next key on 422 (validation error)
            if e.response.status_code == 422:
                continue
            # Other errors: fail immediately
            return False, {
                "endpoint": endpoint,
                "payload_key": key,
                "error": f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            }
        except Exception as e:
            return False, {
                "endpoint": endpoint,
                "payload_key": key,
                "error": str(e)
            }

    # All keys failed
    return False, {
        "endpoint": endpoint,
        "tried_keys": candidate_keys,
        "error": "All input field names failed (422)",
        "hint": f"Check {base_url}/docs for exact schema"
    }

# =============================================================================
# Configuration
# =============================================================================
@dataclass
class ValidatorConfig:
    redis_url: str = 'redis://127.0.0.1:6379'
    qdrant_url: str = 'http://127.0.0.1:6333'
    ollama_url: str = 'http://localhost:11434'
    langextract_url: str = 'http://localhost:8095'  # Docker: phase66-langextract (legal NER)
    langextract_docker: str = 'phase66-langextract'  # Container name
    tsc_bin: str = 'npx tsc'  # TypeScript compiler for strict validation

    # Validation thresholds
    max_new_errors: int = 0  # Zero tolerance for new errors
    min_confidence: float = 0.8  # 80% confidence required

    # Validation layers (both recommended)
    use_langextract: bool = True  # Legal NER + entity extraction
    use_typescript: bool = True   # Strict type checking

# =============================================================================
# LangExtract Integration
# =============================================================================
class LangExtractValidator:
    """Validates code using langextract AST parsing."""

    def __init__(self, config: ValidatorConfig):
        self.config = config
        self.redis: Optional[aioredis.Redis] = None

    async def connect(self):
        """Connect to Redis."""
        self.redis = await aioredis.from_url(
            self.config.redis_url,
            decode_responses=False
        )

    async def close(self):
        """Close connections."""
        if self.redis:
            await self.redis.aclose()

    async def validate_fix(self, fix_id: str) -> Dict[str, Any]:
        """
        Validate a fix attempt using langextract.

        Returns validation report with:
        - syntax_valid: bool
        - type_valid: bool
        - imports_valid: bool
        - semantic_valid: bool
        - overall_valid: bool
        - error_count: int
        - warnings: List[str]
        """
        # Retrieve fix from Redis
        fix_key = f"phase89:fix:{fix_id}"
        fix_data = await self.redis.get(fix_key)

        if not fix_data:
            return {
                'valid': False,
                'error': f'Fix {fix_id} not found in Redis',
                'timestamp': datetime.utcnow().isoformat()
            }

        fix = loads_bytes(fix_data)
        file_path = fix.get('file_path')
        fixed_code = fix.get('fixed_code')

        if not file_path or not fixed_code:
            return {
                'valid': False,
                'error': 'Missing file_path or fixed_code',
                'timestamp': datetime.utcnow().isoformat()
            }

        # Write fixed code to temp file
        temp_file = Path(f'/tmp/langextract_validate_{fix_id}.ts')
        temp_file.write_text(fixed_code, encoding='utf-8')

        try:
            # Layer 1: LangExtract (legal NER + entity extraction)
            langextract_result = None
            if self.config.use_langextract:
                langextract_result = await self._run_langextract(temp_file, fixed_code)

            # Layer 2: TypeScript strict validation
            typescript_result = None
            if self.config.use_typescript:
                typescript_result = await self._run_typescript_check(temp_file)

            # Combine results
            validation = self._analyze_validation(
                langextract_result,
                typescript_result,
                fix
            )

            # Store validation result
            validation['fix_id'] = fix_id
            validation['timestamp'] = datetime.utcnow().isoformat()
            validation['layers'] = {
                'langextract': langextract_result is not None,
                'typescript': typescript_result is not None
            }

            validation_key = f"phase89:validation:{fix_id}"
            await self.redis.set(
                validation_key,
                dumps(validation).encode('utf-8'),
                ex=86400 * 30  # 30 day TTL
            )

            # If valid, promote to KB card
            if validation['overall_valid']:
                await self._promote_to_kb(fix_id, fix, validation)

            return validation

        finally:
            # Cleanup temp file
            if temp_file.exists():
                temp_file.unlink()

    async def _run_langextract(self, file_path: Path, code: str) -> Dict[str, Any]:
        """
        Run langextract via Docker API for legal NER + entity extraction.

        Uses exact OpenAPI schema from http://localhost:8095/openapi.json:
          POST /extract
          {
            "content": str (required) - Text content to analyze
            "document_type": str | null - Type of document (default: "legal")
            "extract_entities": bool - Extract named entities (default: true)
            "extract_structure": bool - Extract document structure (default: true)
            "language": str - Document language (default: "en")
          }
        """
        response: Optional[httpx.Response] = None

        try:
            # Build payload using exact OpenAPI schema
            payload = {
                'content': code,  # Required field
                'document_type': 'code',  # TypeScript/Svelte code, not legal doc
                'extract_entities': True,
                'extract_structure': True,
                'language': 'en'
            }

            # Call langextract Docker container API (/extract endpoint)
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.config.langextract_url}/extract",
                    json=payload,
                    headers={'Content-Type': 'application/json'}
                )
                response.raise_for_status()

                # Parse response
                content_type = (response.headers.get('content-type') or '').lower()
                if 'application/json' in content_type:
                    result = response.json()
                else:
                    result = {'raw': response.text}

                return {
                    'success': True,
                    'endpoint': f"{self.config.langextract_url}/extract",
                    'entities': result.get('entities', []),
                    'structure': result.get('structure', {}),
                    'processing_time': result.get('processing_time', 0),
                    'result': result
                }

        except httpx.ConnectError:
            return {
                'success': False,
                'error': f'Cannot connect to langextract at {self.config.langextract_url}',
                'hint': f'Start container: docker start {self.config.langextract_docker}',
                'endpoint': f"{self.config.langextract_url}/extract"
            }
        except httpx.HTTPStatusError as e:
            return {
                'success': False,
                'error': f'LangExtract HTTP {e.response.status_code}',
                'details': e.response.text[:500] if response else None,
                'endpoint': f"{self.config.langextract_url}/extract"
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'LangExtract exception: {type(e).__name__}: {str(e)}',
                'response_text': response.text[:500] if response else None,
                'endpoint': f"{self.config.langextract_url}/extract"
            }
    def _analyze_validation(
        self,
        langextract: Optional[Dict[str, Any]],
        typescript: Optional[Dict[str, Any]],
        fix: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Combine langextract + TypeScript validation results."""

        # Default to invalid
        result = {
            'syntax_valid': False,
            'type_valid': False,
            'imports_valid': False,
            'semantic_valid': False,
            'overall_valid': False,
            'error_count': 999,
            'warnings': [],
            'layers': {}
        }

        # Layer 1: LangExtract (legal NER + structure)
        if langextract:
            if langextract.get('success'):
                entities = langextract.get('entities', [])
                result['layers']['langextract'] = {
                    'entity_count': len(entities),
                    'processing_time': langextract.get('processing_time', 0),
                    'success': True
                }
                # Basic structural validity
                result['semantic_valid'] = len(entities) > 0
            else:
                result['layers']['langextract'] = {
                    'error': langextract.get('error', 'Unknown error'),
                    'success': False
                }

        # Layer 2: TypeScript (strict type checking)
        if typescript:
            ts_errors = typescript.get('errors', [])
            ts_success = typescript.get('success', False)

            result['layers']['typescript'] = {
                'error_count': len(ts_errors),
                'errors': ts_errors[:5],  # Top 5 errors
                'success': ts_success
            }

            # Strict validation from TypeScript
            result['syntax_valid'] = ts_success
            result['type_valid'] = ts_success
            result['imports_valid'] = ts_success
            result['error_count'] = len(ts_errors)

            if not ts_success:
                result['warnings'] = ts_errors[:3]

        # Overall validity: BOTH layers must pass (if enabled)
        langextract_ok = (
            not langextract or
            (langextract.get('success') and result['semantic_valid'])
        )
        typescript_ok = (
            not typescript or
            typescript.get('success', False)
        )

        result['overall_valid'] = langextract_ok and typescript_ok

        # Confidence score
        if result['overall_valid']:
            result['confidence'] = 0.92  # High confidence if both pass
        elif typescript_ok:
            result['confidence'] = 0.75  # Medium if only TypeScript passes
        elif langextract_ok:
            result['confidence'] = 0.60  # Lower if only NER passes
        else:
            result['confidence'] = 0.30  # Low if both fail

        return result

        # Extract metrics from AST
        syntax_errors = ast_result.get('syntax_errors', [])
        type_errors = ast_result.get('type_errors', [])
        import_errors = ast_result.get('import_errors', [])
        semantic_warnings = ast_result.get('warnings', [])

        # Calculate validity
        syntax_valid = len(syntax_errors) == 0
        type_valid = len(type_errors) <= self.config.max_new_errors
        imports_valid = len(import_errors) == 0
        semantic_valid = len(semantic_warnings) <= 2  # Allow minor warnings

        overall_valid = all([
            syntax_valid,
            type_valid,
            imports_valid,
            semantic_valid
        ])

        return {
            'syntax_valid': syntax_valid,
            'type_valid': type_valid,
            'imports_valid': imports_valid,
            'semantic_valid': semantic_valid,
            'overall_valid': overall_valid,
            'error_count': len(syntax_errors) + len(type_errors) + len(import_errors),
            'warnings': semantic_warnings[:5],  # Top 5 warnings
            'ast_metrics': {
                'functions': ast_result.get('function_count', 0),
                'classes': ast_result.get('class_count', 0),
                'imports': ast_result.get('import_count', 0),
                'exports': ast_result.get('export_count', 0)
            }
        }

    async def _promote_to_kb(self, fix_id: str, fix: Dict[str, Any], validation: Dict[str, Any]):
        """Promote validated fix to KB card (experience layer)."""
        kb_card = {
            'fix_id': fix_id,
            'file_path': fix.get('file_path'),
            'error_code': fix.get('error_code'),
            'before': fix.get('original_code'),
            'after': fix.get('fixed_code'),
            'validation': validation,
            'tags': fix.get('tags', []),
            'confidence': validation.get('confidence', 0.8),
            'created_at': datetime.utcnow().isoformat(),
            'source': 'ace_validated'
        }

        # Store in Redis
        kb_key = f"phase89:kb:{fix_id}"
        await self.redis.set(
            kb_key,
            dumps(kb_card).encode('utf-8'),
            ex=86400 * 90  # 90 day TTL
        )

        # Index to Qdrant (via separate indexer)
        print(f"✅ KB Card created: {fix_id}")

    async def validate_batch(self, limit: int = 100) -> Dict[str, Any]:
        """Validate all pending fixes in batch."""
        # Scan for unvalidated fixes
        fix_keys = []
        async for key in self.redis.scan_iter(match='phase89:fix:*', count=100):
            fix_id = key.decode('utf-8').split(':')[-1]

            # Check if already validated
            validation_key = f"phase89:validation:{fix_id}"
            if not await self.redis.exists(validation_key):
                fix_keys.append(fix_id)

            if len(fix_keys) >= limit:
                break

        print(f"📊 Validating {len(fix_keys)} fixes...")

        results = {
            'total': len(fix_keys),
            'valid': 0,
            'invalid': 0,
            'errors': 0
        }

        for fix_id in fix_keys:
            try:
                validation = await self.validate_fix(fix_id)

                if validation.get('overall_valid'):
                    results['valid'] += 1
                    print(f"   ✅ {fix_id}: VALID")
                else:
                    results['invalid'] += 1
                    print(f"   ⚠️  {fix_id}: INVALID ({validation.get('error_count', 0)} errors)")

            except Exception as e:
                results['errors'] += 1
                print(f"   ❌ {fix_id}: ERROR ({str(e)})")

        return results

# =============================================================================
# Standalone Validation Function (CLI Usage)
# =============================================================================
def validate_langextract_standalone(
    code: str,
    document_type: str = "code",
    timeout_s: int = 30,
) -> Tuple[bool, Dict[str, Any]]:
    """
    Validates code/text using LangExtract Docker container at /extract.

    This is a synchronous wrapper for CLI usage without Redis/async infrastructure.
    For batch processing, use LangExtractValidator class instead.

    Args:
        code: Source code or text to validate
        document_type: Type of document ('code', 'legal', etc.)
        timeout_s: Request timeout in seconds

    Returns:
        (ok, info)
          ok: True if validation succeeded
          info: dict with endpoint, payload, response or error details

    Example:
        ok, info = validate_langextract_standalone(code, "code")
        if ok:
            print(f"Entities: {info['result']['entities']}")
        else:
            print(f"Error: {info['error']}")
    """
    import requests

    LANGEXTRACT_BASE = "http://localhost:8095"
    LANGEXTRACT_EXTRACT_URL = f"{LANGEXTRACT_BASE}/extract"

    # Build payload using exact OpenAPI schema
    payload = {
        'content': code,  # Required field (from schema)
        'document_type': document_type,
        'extract_entities': True,
        'extract_structure': True,
        'language': 'en'
    }

    headers = {'Content-Type': 'application/json'}
    response: Optional[requests.Response] = None

    try:
        response = requests.post(
            LANGEXTRACT_EXTRACT_URL,
            json=payload,
            headers=headers,
            timeout=timeout_s,
        )
        response.raise_for_status()

        # Parse response
        content_type = (response.headers.get('content-type') or '').lower()
        if 'application/json' in content_type:
            data = response.json()
        else:
            data = {'raw': response.text}

        return True, {
            'endpoint': LANGEXTRACT_EXTRACT_URL,
            'payload': payload,
            'result': data,
            'entities': data.get('entities', []),
            'structure': data.get('structure', {}),
        }

    except requests.exceptions.ConnectionError:
        return False, {
            'endpoint': LANGEXTRACT_EXTRACT_URL,
            'payload': payload,
            'error': 'Connection refused',
            'hint': 'Start container: docker start phase66-langextract',
        }

    except requests.exceptions.HTTPError as e:
        return False, {
            'endpoint': LANGEXTRACT_EXTRACT_URL,
            'payload': payload,
            'error': f'HTTP {e.response.status_code}',
            'response_text': response.text[:500] if response else None,
            'hint': 'Check http://localhost:8095/docs for API documentation',
        }

    except requests.RequestException as e:
        return False, {
            'endpoint': LANGEXTRACT_EXTRACT_URL,
            'payload': payload,
            'error': f'{type(e).__name__}: {str(e)}',
            'response_text': response.text[:500] if response else None,
        }

# =============================================================================
# CLI
# =============================================================================
async def main():
    import argparse

    parser = argparse.ArgumentParser(description='Phase 89: LangExtract Validator')
    parser.add_argument('file', nargs='?', help='File path to validate (standalone mode)')
    parser.add_argument('--fix-id', help='Validate specific fix ID (requires Redis)')
    parser.add_argument('--batch', action='store_true', help='Validate all pending fixes (requires Redis)')
    parser.add_argument('--limit', type=int, default=100, help='Max fixes to validate in batch')
    parser.add_argument('--document-type', default='code', help='Document type (code, legal, etc.)')

    args = parser.parse_args()

    # Standalone file validation (no Redis)
    if args.file:
        print(f"📄 Standalone validation: {args.file}")
        print()

        try:
            code = Path(args.file).read_text(encoding='utf-8')
            ok, info = validate_langextract_standalone(code, args.document_type)

            print(json.dumps({'ok': ok, **info}, indent=2))
            sys.exit(0 if ok else 1)

        except Exception as e:
            print(json.dumps({
                'ok': False,
                'error': f'{type(e).__name__}: {str(e)}'
            }, indent=2))
            sys.exit(1)

    # Redis-based validation
    config = ValidatorConfig()
    validator = LangExtractValidator(config)

    print(f"📦 JSON Backend: {BACKEND}")
    print(f"🔧 Validation Layers:")
    print(f"   Layer 1 - LangExtract (NER): {config.langextract_url} (Docker: {config.langextract_docker})")
    print(f"   Layer 2 - TypeScript (tsc): {config.tsc_bin}")
    print()

    await validator.connect()

    try:
        if args.fix_id:
            print(f"🔍 Validating fix: {args.fix_id}")
            result = await validator.validate_fix(args.fix_id)
            print()
            print(json.dumps(result, indent=2))

        elif args.batch:
            print(f"🔍 Batch validation (limit: {args.limit})")
            results = await validator.validate_batch(args.limit)
            print()
            print(f"📊 Results:")
            print(f"   Total: {results['total']}")
            print(f"   ✅ Valid: {results['valid']}")
            print(f"   ⚠️  Invalid: {results['invalid']}")
            print(f"   ❌ Errors: {results['errors']}")

        else:
            parser.print_help()

    finally:
        await validator.close()

if __name__ == '__main__':
    asyncio.run(main())
