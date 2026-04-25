#!/usr/bin/env python3
"""
Week 3 Task 1: Test KB Fixing Workflow
Tests the human-in-the-loop error fixing API end-to-end.

Workflow:
1. Submit error context → Search KB for fix sources
2. User validates sources → Approve/reject
3. Generate fix → LLM creates fix using validated sources
4. Apply fix → Track provenance
5. Query history → Verify fix recorded
"""

import requests
import json
import time
from typing import Dict, List

API_BASE = "http://localhost:8001/api/kb"

def test_search_fix_sources() -> Dict:
    """Step 1: Search KB for sources to fix an error"""
    print("\n" + "="*60)
    print("STEP 1: Search KB for Fix Sources")
    print("="*60)

    error_context = {
        "file_path": "src/lib/components/ErrorExample.svelte",
        "error_message": "Cannot find name 'useState'. Did you mean '$state'?",
        "error_type": "typescript",
        "line_number": 42,
        "code_context": """
            <script lang="ts">
              // Svelte 4 syntax - needs migration to Svelte 5
              import { useState } from 'svelte';

              let count = useState(0);
            </script>
        """,
        "stack_trace": "at ErrorExample.svelte:42:15"
    }

    print(f"\n📝 Error Context:")
    print(f"   File: {error_context['file_path']}")
    print(f"   Error: {error_context['error_message']}")
    print(f"   Type: {error_context['error_type']}")

    try:
        response = requests.post(
            f"{API_BASE}/search-fix-sources",
            json=error_context,
            timeout=30
        )
        response.raise_for_status()
        result = response.json()

        print(f"\n✅ Search complete!")
        print(f"   Error ID: {result['error_id']}")
        print(f"   Sources found: {result['total_found']}")
        print(f"\n📚 Top sources:")
        for i, src in enumerate(result['sources'][:5], 1):
            print(f"   {i}. [{src['source_type']}] {src['title']}")
            print(f"      Relevance: {src['relevance_score']:.2f}")
            print(f"      Preview: {src['content'][:100]}...")
            print()

        return result
    except requests.exceptions.RequestException as e:
        print(f"❌ Search failed: {e}")
        return {}

def test_validate_sources(error_id: str, sources: List[Dict]) -> Dict:
    """Step 2: User validates sources (approve/reject)"""
    print("\n" + "="*60)
    print("STEP 2: Validate Sources")
    print("="*60)

    # Simulate user validation:
    # - Approve Qdrant sources (likely high-quality)
    # - Approve CouchDB summaries for same file type
    # - Reject low relevance sources
    validated = [
        src['source_id'] for src in sources
        if src['source_type'] == 'qdrant' or src['relevance_score'] > 0.6
    ]
    rejected = [
        src['source_id'] for src in sources
        if src['source_id'] not in validated
    ]

    validation_request = {
        "error_id": error_id,
        "validated_sources": validated,
        "rejected_sources": rejected,
        "validation_notes": "Auto-approved Qdrant sources and high-relevance CouchDB summaries"
    }

    print(f"\n👤 User Validation:")
    print(f"   ✅ Approved: {len(validated)} sources")
    print(f"   ❌ Rejected: {len(rejected)} sources")

    try:
        response = requests.post(
            f"{API_BASE}/validate-sources",
            json=validation_request,
            timeout=10
        )
        response.raise_for_status()
        result = response.json()

        print(f"\n✅ Validation complete!")
        print(f"   Status: {result['status']}")
        print(f"   Validated: {result['validated_count']}")
        print(f"   Rejected: {result['rejected_count']}")

        return result
    except requests.exceptions.RequestException as e:
        print(f"❌ Validation failed: {e}")
        return {}

def test_generate_fix(error_id: str, validated_sources: List[str]) -> Dict:
    """Step 3: Generate fix using validated sources"""
    print("\n" + "="*60)
    print("STEP 3: Generate Fix with LLM")
    print("="*60)

    fix_request = {
        "error_id": error_id,
        "validated_sources": validated_sources,
        "llm_provider": "gemma3-legal:latest",
        "include_explanation": True
    }

    print(f"\n🤖 Requesting fix generation...")
    print(f"   LLM: {fix_request['llm_provider']}")
    print(f"   Validated sources: {len(validated_sources)}")

    try:
        start_time = time.time()
        response = requests.post(
            f"{API_BASE}/generate-fix",
            json=fix_request,
            timeout=60  # LLM may take time
        )
        response.raise_for_status()
        result = response.json()
        duration = time.time() - start_time

        print(f"\n✅ Fix generated! (took {duration:.1f}s)")
        print(f"   Fix ID: {result['fix_id']}")
        print(f"   Confidence: {result['confidence_score']:.2f}")
        print(f"\n📝 Original Code:")
        print("   " + "\n   ".join(result['original_code'].strip().split('\n')[:10]))
        print(f"\n🔧 Fixed Code:")
        print("   " + "\n   ".join(result['fixed_code'].strip().split('\n')[:10]))
        print(f"\n💡 Explanation:")
        print("   " + "\n   ".join(result['explanation'].strip().split('\n')[:5]))
        print(f"\n📚 Source Citations:")
        for citation in result['source_citations']:
            print(f"   - {citation}")

        return result
    except requests.exceptions.RequestException as e:
        print(f"❌ Fix generation failed: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"   Response: {e.response.text[:200]}")
        return {}

def test_apply_fix(fix_id: str) -> Dict:
    """Step 4: Apply fix and track provenance"""
    print("\n" + "="*60)
    print("STEP 4: Apply Fix")
    print("="*60)

    apply_request = {
        "fix_id": fix_id,
        "user_approved": True,
        "application_notes": "Automated test application - would write to file system in production"
    }

    print(f"\n🚀 Applying fix...")
    print(f"   Fix ID: {fix_id}")
    print(f"   User approved: {apply_request['user_approved']}")

    try:
        response = requests.post(
            f"{API_BASE}/apply-fix",
            json=apply_request,
            timeout=10
        )
        response.raise_for_status()
        result = response.json()

        print(f"\n✅ Fix applied!")
        print(f"   File: {result['file_path']}")
        print(f"   Applied at: {result['applied_at']}")
        print(f"   Success: {result['success']}")
        print(f"   Validated sources used: {len(result['validated_sources'])}")

        return result
    except requests.exceptions.RequestException as e:
        print(f"❌ Fix application failed: {e}")
        return {}

def test_fix_history(file_path: str):
    """Step 5: Query fix history for a file"""
    print("\n" + "="*60)
    print("STEP 5: Query Fix History")
    print("="*60)

    print(f"\n🔍 Querying history for: {file_path}")

    try:
        response = requests.get(
            f"{API_BASE}/fix-history/{file_path}",
            timeout=10
        )
        response.raise_for_status()
        history = response.json()

        print(f"\n✅ History retrieved!")
        print(f"   Total fixes: {len(history)}")

        for i, fix in enumerate(history, 1):
            print(f"\n   Fix #{i}:")
            print(f"     Fix ID: {fix['fix_id']}")
            print(f"     Applied: {fix['applied_at']}")
            print(f"     Success: {fix['success']}")
            print(f"     Sources: {len(fix['validated_sources'])}")

    except requests.exceptions.RequestException as e:
        print(f"❌ History query failed: {e}")

def test_stats():
    """Query overall KB fixing statistics"""
    print("\n" + "="*60)
    print("BONUS: Overall Statistics")
    print("="*60)

    try:
        response = requests.get(f"{API_BASE}/stats", timeout=10)
        response.raise_for_status()
        stats = response.json()

        print(f"\n📊 KB Fixing Statistics:")
        print(f"   Active error sessions: {stats['active_error_sessions']}")
        print(f"   Generated fixes: {stats['generated_fixes']}")
        print(f"   Applied fixes: {stats['applied_fixes']}")
        print(f"   Success rate: {stats['success_rate']:.1%}")
        print(f"   Total sources validated: {stats['total_sources_validated']}")

    except requests.exceptions.RequestException as e:
        print(f"❌ Stats query failed: {e}")

def main():
    """Run complete KB fixing workflow test"""
    print("\n" + "="*70)
    print(" "*15 + "🧪 KB FIXING WORKFLOW TEST")
    print("="*70)
    print("\nThis tests the complete human-in-the-loop error fixing workflow:")
    print("  1. Search KB for fix sources (Qdrant + CouchDB)")
    print("  2. User validates sources")
    print("  3. LLM generates fix using validated sources")
    print("  4. Apply fix and track provenance")
    print("  5. Query fix history")

    # Step 1: Search for fix sources
    search_result = test_search_fix_sources()
    if not search_result:
        print("\n❌ Workflow stopped: Search failed")
        return

    error_id = search_result['error_id']
    sources = search_result['sources']

    # Step 2: Validate sources
    validation_result = test_validate_sources(error_id, sources)
    if not validation_result:
        print("\n❌ Workflow stopped: Validation failed")
        return

    validated_sources = [
        src['source_id'] for src in sources
        if src['source_type'] == 'qdrant' or src['relevance_score'] > 0.6
    ]

    # Step 3: Generate fix
    fix_result = test_generate_fix(error_id, validated_sources)
    if not fix_result:
        print("\n❌ Workflow stopped: Fix generation failed")
        return

    fix_id = fix_result['fix_id']

    # Step 4: Apply fix
    apply_result = test_apply_fix(fix_id)
    if not apply_result:
        print("\n❌ Workflow stopped: Fix application failed")
        return

    file_path = apply_result['file_path']

    # Step 5: Query history
    test_fix_history(file_path)

    # Bonus: Overall stats
    test_stats()

    print("\n" + "="*70)
    print(" "*20 + "✅ WORKFLOW TEST COMPLETE!")
    print("="*70)
    print("\nNext steps:")
    print("  1. Migrate in-memory storage to PostgreSQL")
    print("  2. Implement actual file system writes in apply_fix()")
    print("  3. Build Svelte UI for error submission + source validation")
    print("  4. Add auto-approval rules (Week 3 Task 2)")
    print("  5. Create provenance graph visualization (Week 3 Task 3)")

if __name__ == "__main__":
    main()
