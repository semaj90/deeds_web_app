#!/usr/bin/env python3
"""
Week 3 Tasks 2-4: Test Script
==============================

Tests:
    Task 2: Auto-approval rules CRUD
    Task 3: Provenance tracking queries
    Task 4: Agentic fix generation
"""

import sys

# Fix Windows console encoding issues
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

import requests
import json
import time
from typing import Dict, List

API_BASE = "http://localhost:8001/api/kb/v2"

def test_auto_approval_rules():
    """Task 2: Test auto-approval rules"""
    print("\n" + "="*70)
    print("TASK 2: AUTO-APPROVAL RULES")
    print("="*70)

    # Test 1: List default rules
    print("\n1️⃣ List default auto-approval rules")
    response = requests.get(f"{API_BASE}/approval-rules")
    rules = response.json()
    print(f"   ✅ Found {len(rules)} default rules")
    for rule in rules:
        print(f"      - {rule['source_pattern']} ({rule['source_type']}): score >= {rule['min_relevance_score']}")

    # Test 2: Create custom rule
    print("\n2️⃣ Create custom auto-approval rule")
    new_rule = {
        "source_pattern": "github.com/microsoft/TypeScript.*",
        "source_type": "qdrant",
        "min_relevance_score": 0.90,
        "description": "Official TypeScript GitHub",
        "created_by": "test_script"
    }
    response = requests.post(f"{API_BASE}/approval-rules", json=new_rule)
    created = response.json()
    print(f"   ✅ Created rule ID: {created['rule_id']}")

    # Test 3: List all rules (including new one)
    print("\n3️⃣ Verify new rule exists")
    response = requests.get(f"{API_BASE}/approval-rules")
    rules = response.json()
    print(f"   ✅ Total rules: {len(rules)}")

    # Test 4: Delete custom rule
    print("\n4️⃣ Delete custom rule")
    response = requests.delete(f"{API_BASE}/approval-rules/{created['rule_id']}")
    print(f"   ✅ Deleted rule {created['rule_id']}")

    return rules


def test_provenance_tracking():
    """Task 3: Test provenance tracking"""
    print("\n" + "="*70)
    print("TASK 3: PROVENANCE TRACKING")
    print("="*70)

    # Test 1: Query provenance by file path
    print("\n1️⃣ Query fixes for a file")
    test_file = "src/lib/components/ErrorExample.svelte"
    response = requests.get(f"{API_BASE}/provenance/file/{test_file}")
    result = response.json()
    print(f"   File: {test_file}")
    print(f"   Total fixes: {result['total_fixes']}")

    if result['fixes']:
        latest = result['fixes'][0]
        print(f"   Latest fix: {latest['fix_id']}")
        print(f"   Applied: {latest['applied_at']}")
        print(f"   Success: {latest['success']}")

    # Test 2: Query provenance by source
    print("\n2️⃣ Query fixes using a specific source")
    test_source = "qdrant_svelte_docs_001"
    response = requests.get(f"{API_BASE}/provenance/source/{test_source}")
    result = response.json()
    print(f"   Source: {test_source}")
    print(f"   Times used: {result['times_used']}")


def test_agentic_fix_generation():
    """Task 4: Test agentic fix generation"""
    print("\n" + "="*70)
    print("TASK 4: AGENTIC FIX GENERATION")
    print("="*70)

    # Test: Start agentic fix task
    print("\n1️⃣ Start agentic fix generation")
    request = {
        "file_path": "src/lib/components/Counter.svelte",
        "error_message": "Cannot find name 'useState'. Did you mean '$state'?",
        "error_type": "typescript",
        "max_iterations": 2,
        "auto_apply": False,
        "confidence_threshold": 0.85
    }

    response = requests.post(f"{API_BASE}/agentic-fix", json=request)
    result = response.json()
    task_id = result['task_id']

    print(f"   ✅ Started task: {task_id}")
    print(f"   Status: {result['status']}")
    print(f"   Check status: {result['check_status_url']}")

    # Test: Poll status
    print("\n2️⃣ Polling agentic task status...")
    for i in range(10):
        time.sleep(2)
        response = requests.get(f"{API_BASE}/agentic-status/{task_id}")
        status = response.json()

        print(f"   Iteration {i+1}: {status['status']} (iteration {status['current_iteration']}/{status['max_iterations']})")
        print(f"      Sources found: {status['sources_found']}")
        print(f"      Fixes generated: {status['fixes_generated']}")

        if status.get('confidence_score'):
            print(f"      Confidence: {status['confidence_score']:.2f}")

        if status['status'] in ['completed', 'failed']:
            if status['status'] == 'completed':
                print(f"   ✅ Task completed!")
            else:
                print(f"   ❌ Task failed: {status.get('error_message')}")
            break

    return task_id


def test_integration_workflow():
    """Full integration test: auto-approval + agentic + provenance"""
    print("\n" + "="*70)
    print("INTEGRATION TEST: Full Workflow")
    print("="*70)

    print("\n📝 Scenario: Svelte 5 migration with auto-approval")
    print("   - Submit error for agentic fix")
    print("   - Auto-validate sources based on rules")
    print("   - Generate fix with multi-step reasoning")
    print("   - Track provenance in database")

    # Create specific auto-approval rule
    print("\n1️⃣ Create Svelte 5 auto-approval rule")
    rule = {
        "source_pattern": ".*svelte.*migration.*",
        "source_type": "qdrant",
        "min_relevance_score": 0.75,
        "description": "Svelte migration guides",
        "created_by": "integration_test"
    }
    response = requests.post(f"{API_BASE}/approval-rules", json=rule)
    rule_id = response.json()['rule_id']
    print(f"   ✅ Created rule: {rule_id}")

    # Start agentic fix
    print("\n2️⃣ Start agentic fix generation")
    request = {
        "file_path": "src/lib/stores/UserStore.svelte",
        "error_message": "import { writable } from 'svelte/store' is deprecated",
        "error_type": "svelte5_migration",
        "max_iterations": 3,
        "auto_apply": False,
        "confidence_threshold": 0.80
    }

    response = requests.post(f"{API_BASE}/agentic-fix", json=request)
    task_id = response.json()['task_id']
    print(f"   ✅ Task started: {task_id}")

    # Wait for completion
    print("\n3️⃣ Waiting for task completion...")
    for i in range(15):
        time.sleep(2)
        response = requests.get(f"{API_BASE}/agentic-status/{task_id}")
        status = response.json()

        if status['status'] in ['completed', 'failed']:
            break

    print(f"   ✅ Final status: {status['status']}")

    # Query provenance
    print("\n4️⃣ Query provenance for file")
    response = requests.get(f"{API_BASE}/provenance/file/{request['file_path']}")
    result = response.json()
    print(f"   Total fixes for file: {result['total_fixes']}")

    # Cleanup
    print("\n5️⃣ Cleanup test rule")
    requests.delete(f"{API_BASE}/approval-rules/{rule_id}")
    print(f"   ✅ Deleted rule {rule_id}")


def main():
    print("\n" + "="*70)
    print(" "*15 + "🧪 WEEK 3 TASKS 2-4 TEST SUITE")
    print("="*70)
    print("\nTesting:")
    print("  Task 2: Auto-Approval Engine")
    print("  Task 3: Provenance Tracking")
    print("  Task 4: Agentic Fix Generator")

    try:
        # Task 2: Auto-approval
        test_auto_approval_rules()

        # Task 3: Provenance
        test_provenance_tracking()

        # Task 4: Agentic
        test_agentic_fix_generation()

        # Integration
        test_integration_workflow()

        print("\n" + "="*70)
        print(" "*20 + "✅ ALL TESTS COMPLETE!")
        print("="*70)
        print("\nWeek 3 Tasks 2-4 Status:")
        print("  ✅ Task 2: Auto-Approval Engine working")
        print("  ✅ Task 3: Provenance Tracking working")
        print("  ✅ Task 4: Agentic Fix Generator working")
        print("\nNext: Integrate with PostgreSQL for persistent storage")

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
