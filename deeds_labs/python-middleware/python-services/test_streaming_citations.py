#!/usr/bin/env python3
"""
Test suite for streaming RAG and citation enforcement.

Tests:
1. Citation validation logic
2. Prompt formatting with citations
3. Streaming endpoint (requires running service)
"""

import asyncio
import json
import re
from typing import List, Dict, Any

# Import from nlp_middleware_service
import sys
sys.path.insert(0, '/app/python-services')

from nlp_middleware_service import (
    format_llm_prompt_with_citations,
    validate_citations,
)


# ============================================================================
# Test: Citation Validation
# ============================================================================

def test_validate_citations_valid():
    """Test validation of valid citations"""
    response = "Perjury is [&1] defined as [&2] willfully giving false testimony."
    assert validate_citations(response, 2) == True
    print("✓ test_validate_citations_valid passed")


def test_validate_citations_invalid_number():
    """Test validation rejects out-of-range citations"""
    response = "Perjury is [&1] defined as [&5] willfully giving false testimony."
    assert validate_citations(response, 2) == False
    print("✓ test_validate_citations_invalid_number passed")


def test_validate_citations_missing():
    """Test validation rejects missing citations"""
    response = "Perjury is defined as willfully giving false testimony under oath."
    assert validate_citations(response, 2) == False
    print("✓ test_validate_citations_missing passed")


def test_validate_citations_short_response():
    """Test validation allows short responses without citations"""
    response = "Yes"
    assert validate_citations(response, 2) == True
    print("✓ test_validate_citations_short_response passed")


def test_validate_citations_multiple():
    """Test validation with multiple citations"""
    response = "Perjury [&1] is defined [&2] as willfully [&3] giving false testimony [&1]."
    assert validate_citations(response, 3) == True
    print("✓ test_validate_citations_multiple passed")


# ============================================================================
# Test: Prompt Formatting
# ============================================================================

def test_format_llm_prompt_basic():
    """Test basic prompt formatting"""
    docs = [
        {"text": "Perjury is defined as...", "source": "chunk-1"},
        {"text": "Penalties include...", "source": "chunk-2"}
    ]
    prompt = format_llm_prompt_with_citations("What is perjury?", docs)

    # Check prompt contains required elements
    assert "What is perjury?" in prompt
    assert "[1]" in prompt
    assert "[2]" in prompt
    assert "STRICT RULES:" in prompt
    assert "[&1]" in prompt
    assert "[&2]" in prompt
    print("✓ test_format_llm_prompt_basic passed")


def test_format_llm_prompt_with_kag():
    """Test prompt formatting with knowledge graph"""
    docs = [
        {"text": "Perjury is defined as...", "source": "chunk-1"}
    ]
    kag = {"entities": ["perjury", "testimony"], "relationships": []}
    prompt = format_llm_prompt_with_citations("What is perjury?", docs, kag)

    assert "[GRAPH CONTEXT]" in prompt
    assert "entities" in prompt
    print("✓ test_format_llm_prompt_with_kag passed")


def test_format_llm_prompt_empty_docs():
    """Test prompt formatting with empty docs"""
    docs = []
    prompt = format_llm_prompt_with_citations("What is perjury?", docs)

    assert "What is perjury?" in prompt
    assert "STRICT RULES:" in prompt
    print("✓ test_format_llm_prompt_empty_docs passed")


def test_format_llm_prompt_missing_source():
    """Test prompt formatting handles missing source"""
    docs = [
        {"text": "Perjury is defined as..."}  # Missing 'source' key
    ]
    prompt = format_llm_prompt_with_citations("What is perjury?", docs)

    assert "[1]" in prompt
    assert "source=unknown" in prompt
    print("✓ test_format_llm_prompt_missing_source passed")


# ============================================================================
# Test: Citation Pattern Extraction
# ============================================================================

def test_citation_pattern_extraction():
    """Test extraction of citation patterns"""
    response = "Perjury is [&1] defined as [&2] willfully giving false testimony [&1]."

    pattern = r'\[&\d+\]'
    citations = re.findall(pattern, response)

    assert len(citations) == 3
    assert citations == ['[&1]', '[&2]', '[&1]']
    print("✓ test_citation_pattern_extraction passed")


def test_citation_number_extraction():
    """Test extraction of citation numbers"""
    response = "Perjury is [&1] defined as [&2] willfully giving false testimony [&1]."

    pattern = r'\[&(\d+)\]'
    numbers = [int(m) for m in re.findall(pattern, response)]

    assert numbers == [1, 2, 1]
    print("✓ test_citation_number_extraction passed")


# ============================================================================
# Test: Edge Cases
# ============================================================================

def test_validate_citations_zero():
    """Test validation with zero sources"""
    response = "No information available."
    assert validate_citations(response, 0) == True
    print("✓ test_validate_citations_zero passed")


def test_validate_citations_large_number():
    """Test validation with large citation numbers"""
    response = "Information [&100]"
    assert validate_citations(response, 50) == False
    print("✓ test_validate_citations_large_number passed")


def test_validate_citations_negative():
    """Test validation rejects negative citation numbers"""
    response = "Information [&-1]"
    # Regex won't match negative numbers, so no citations found
    assert validate_citations(response, 1) == False
    print("✓ test_validate_citations_negative passed")


def test_validate_citations_malformed():
    """Test validation handles malformed citations"""
    response = "Information [&a] and [&1b]"
    # Regex won't match malformed patterns
    assert validate_citations(response, 1) == False
    print("✓ test_validate_citations_malformed passed")


# ============================================================================
# Test: Real-World Scenarios
# ============================================================================

def test_legal_response_with_citations():
    """Test real legal response with proper citations"""
    response = """Perjury in California is defined as willfully giving false testimony [&1].
    Penalties include imprisonment up to 4 years [&2] and fines up to $10,000 [&2].
    The statute applies to all witnesses [&1]."""

    assert validate_citations(response, 2) == True
    print("✓ test_legal_response_with_citations passed")


def test_legal_response_hallucination():
    """Test detection of hallucinated legal response"""
    response = """Perjury in California carries a mandatory 10-year sentence and $50,000 fine.
    This is a serious felony with lifetime consequences."""

    # No citations, substantial response = hallucination
    assert validate_citations(response, 2) == False
    print("✓ test_legal_response_hallucination passed")


def test_legal_response_partial_hallucination():
    """Test detection of partially hallucinated response"""
    response = """Perjury is defined as [&1] willfully giving false testimony.
    The penalty is 10 years imprisonment and $50,000 fine."""

    # Has citation for first part but not second = hallucination
    assert validate_citations(response, 1) == False
    print("✓ test_legal_response_partial_hallucination passed")


# ============================================================================
# Integration Test (requires running service)
# ============================================================================

async def test_streaming_endpoint():
    """Test streaming endpoint (requires running service)"""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "http://localhost:8003/rag/stream",
                json={
                    "query": "What is perjury?",
                    "context": [
                        "Perjury is the act of willfully giving false testimony under oath.",
                        "Penalties for perjury vary by jurisdiction."
                    ],
                    "chunk_ids": ["1", "2"]
                }
            )

            if response.status_code == 200:
                print("✓ test_streaming_endpoint passed (service running)")
                # Print first 100 chars of response
                content = await response.aread()
                print(f"  Response preview: {content[:100].decode('utf-8', errors='ignore')}")
            else:
                print(f"✗ test_streaming_endpoint failed: {response.status_code}")
    except Exception as e:
        print(f"⊘ test_streaming_endpoint skipped (service not running): {e}")


# ============================================================================
# Run All Tests
# ============================================================================

def run_all_tests():
    """Run all tests"""
    print("\n" + "="*70)
    print("STREAMING & CITATION ENFORCEMENT TEST SUITE")
    print("="*70 + "\n")

    # Citation validation tests
    print("Citation Validation Tests:")
    test_validate_citations_valid()
    test_validate_citations_invalid_number()
    test_validate_citations_missing()
    test_validate_citations_short_response()
    test_validate_citations_multiple()

    # Prompt formatting tests
    print("\nPrompt Formatting Tests:")
    test_format_llm_prompt_basic()
    test_format_llm_prompt_with_kag()
    test_format_llm_prompt_empty_docs()
    test_format_llm_prompt_missing_source()

    # Citation pattern tests
    print("\nCitation Pattern Tests:")
    test_citation_pattern_extraction()
    test_citation_number_extraction()

    # Edge case tests
    print("\nEdge Case Tests:")
    test_validate_citations_zero()
    test_validate_citations_large_number()
    test_validate_citations_negative()
    test_validate_citations_malformed()

    # Real-world scenario tests
    print("\nReal-World Scenario Tests:")
    test_legal_response_with_citations()
    test_legal_response_hallucination()
    test_legal_response_partial_hallucination()

    # Integration test
    print("\nIntegration Tests:")
    asyncio.run(test_streaming_endpoint())

    print("\n" + "="*70)
    print("TEST SUITE COMPLETE")
    print("="*70 + "\n")


if __name__ == "__main__":
    run_all_tests()
