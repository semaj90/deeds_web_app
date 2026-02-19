#!/usr/bin/env python3
"""
Validation module for legal evidence and citation constraints.

Enforces:
- Jurisdiction enum validation
- File type validation
- Processing status validation
- File size limits
- Citation tag validation
"""

import re
from typing import List, Dict, Any, Optional
from enum import Enum


# ============================================================================
# Enums
# ============================================================================

class Jurisdiction(str, Enum):
    """Valid jurisdictions"""
    CA = "CA"
    NY = "NY"
    TX = "TX"
    FED_US = "Fed-US"
    OTHER = "Other"


class FileType(str, Enum):
    """Valid file types"""
    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"


class ProcessingStatus(str, Enum):
    """Valid processing statuses"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Operation(str, Enum):
    """Valid audit log operations"""
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


# ============================================================================
# Constants
# ============================================================================

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
MIN_FILE_SIZE = 1024  # 1KB

VALID_JURISDICTIONS = [j.value for j in Jurisdiction]
VALID_FILE_TYPES = [f.value for f in FileType]
VALID_PROCESSING_STATUSES = [s.value for s in ProcessingStatus]
VALID_OPERATIONS = [o.value for o in Operation]


# ============================================================================
# Validation Functions
# ============================================================================

def validate_jurisdiction(jurisdiction: str) -> tuple[bool, Optional[str]]:
    """
    Validate jurisdiction value.

    Args:
        jurisdiction: Jurisdiction string

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not jurisdiction:
        return False, "Jurisdiction is required"

    if jurisdiction not in VALID_JURISDICTIONS:
        return False, f"Invalid jurisdiction. Must be one of: {', '.join(VALID_JURISDICTIONS)}"

    return True, None


def validate_file_type(file_type: str) -> tuple[bool, Optional[str]]:
    """
    Validate file type.

    Args:
        file_type: File type string (pdf, docx, txt)

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not file_type:
        return False, "File type is required"

    if file_type not in VALID_FILE_TYPES:
        return False, f"Invalid file type. Must be one of: {', '.join(VALID_FILE_TYPES)}"

    return True, None


def validate_file_size(file_size: int) -> tuple[bool, Optional[str]]:
    """
    Validate file size.

    Args:
        file_size: File size in bytes

    Returns:
        Tuple of (is_valid, error_message)
    """
    if file_size < MIN_FILE_SIZE:
        return False, f"File size too small. Minimum: {MIN_FILE_SIZE} bytes"

    if file_size > MAX_FILE_SIZE:
        return False, f"File size too large. Maximum: {MAX_FILE_SIZE / 1024 / 1024:.0f}MB"

    return True, None


def validate_processing_status(status: str) -> tuple[bool, Optional[str]]:
    """
    Validate processing status.

    Args:
        status: Processing status string

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not status:
        return False, "Processing status is required"

    if status not in VALID_PROCESSING_STATUSES:
        return False, f"Invalid status. Must be one of: {', '.join(VALID_PROCESSING_STATUSES)}"

    return True, None


def validate_tag_name(tag_name: str) -> tuple[bool, Optional[str]]:
    """
    Validate citation tag name.

    Args:
        tag_name: Tag name string

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not tag_name:
        return False, "Tag name is required"

    if len(tag_name) < 2:
        return False, "Tag name must be at least 2 characters"

    if len(tag_name) > 255:
        return False, "Tag name must be at most 255 characters"

    # Allow alphanumeric, hyphens, underscores
    if not re.match(r'^[a-zA-Z0-9\-_]+$', tag_name):
        return False, "Tag name must contain only alphanumeric characters, hyphens, and underscores"

    return True, None


def validate_url(url: str) -> tuple[bool, Optional[str]]:
    """
    Validate URL format.

    Args:
        url: URL string

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not url:
        return True, None  # URL is optional

    # Simple URL validation
    url_pattern = r'^https?://[^\s/$.?#].[^\s]*$'
    if not re.match(url_pattern, url, re.IGNORECASE):
        return False, "Invalid URL format"

    return True, None


def validate_evidence_file(
    filename: str,
    file_type: str,
    file_size: int,
    jurisdiction: str,
    processing_status: str = "pending"
) -> Dict[str, Any]:
    """
    Validate complete evidence file data.

    Args:
        filename: File name
        file_type: File type (pdf, docx, txt)
        file_size: File size in bytes
        jurisdiction: Jurisdiction (CA, NY, TX, Fed-US, Other)
        processing_status: Processing status (pending, processing, completed, failed)

    Returns:
        Dict with validation results: {is_valid, errors}
    """
    errors = []

    # Validate jurisdiction
    valid, error = validate_jurisdiction(jurisdiction)
    if not valid:
        errors.append(error)

    # Validate file type
    valid, error = validate_file_type(file_type)
    if not valid:
        errors.append(error)

    # Validate file size
    valid, error = validate_file_size(file_size)
    if not valid:
        errors.append(error)

    # Validate processing status
    valid, error = validate_processing_status(processing_status)
    if not valid:
        errors.append(error)

    return {
        "is_valid": len(errors) == 0,
        "errors": errors
    }


def validate_citation_tag(
    name: str,
    jurisdiction: str,
    description: Optional[str] = None
) -> Dict[str, Any]:
    """
    Validate complete citation tag data.

    Args:
        name: Tag name
        jurisdiction: Jurisdiction
        description: Optional description

    Returns:
        Dict with validation results: {is_valid, errors}
    """
    errors = []

    # Validate tag name
    valid, error = validate_tag_name(name)
    if not valid:
        errors.append(error)

    # Validate jurisdiction
    valid, error = validate_jurisdiction(jurisdiction)
    if not valid:
        errors.append(error)

    return {
        "is_valid": len(errors) == 0,
        "errors": errors
    }


def validate_audit_log_entry(
    user_id: str,
    resource_type: str,
    resource_id: str,
    operation: str,
    old_values: Optional[Dict] = None,
    new_values: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Validate audit log entry.

    Args:
        user_id: User ID
        resource_type: Resource type (Evidence, Tag, etc.)
        resource_id: Resource ID
        operation: Operation (CREATE, UPDATE, DELETE)
        old_values: Old values (for UPDATE/DELETE)
        new_values: New values (for CREATE/UPDATE)

    Returns:
        Dict with validation results: {is_valid, errors}
    """
    errors = []

    if not user_id:
        errors.append("User ID is required")

    if not resource_type:
        errors.append("Resource type is required")

    if not resource_id:
        errors.append("Resource ID is required")

    if operation not in VALID_OPERATIONS:
        errors.append(f"Invalid operation. Must be one of: {', '.join(VALID_OPERATIONS)}")

    # Validate operation-specific requirements
    if operation == "UPDATE" and not old_values:
        errors.append("Old values required for UPDATE operation")

    if operation == "DELETE" and not old_values:
        errors.append("Old values required for DELETE operation")

    return {
        "is_valid": len(errors) == 0,
        "errors": errors
    }


# ============================================================================
# Tag Weight Calculation
# ============================================================================

def calculate_tag_weight(usage_count: int, base_weight: float = 1.0) -> float:
    """
    Calculate tag weight using auto-scaling formula.

    Formula: weight = base_weight + log(1 + usage_count)

    This ensures:
    - Tags grow in influence as they're used
    - Growth is logarithmic (not exponential)
    - New tags start at base_weight
    - Frequently used tags get higher weight

    Args:
        usage_count: Number of times tag was used in saved summaries
        base_weight: Base weight (default 1.0)

    Returns:
        Calculated weight
    """
    import math
    return base_weight + math.log(1 + usage_count)


def get_tag_boost_factor(tag_weight: float) -> float:
    """
    Convert tag weight to RAG search boost factor.

    Args:
        tag_weight: Tag weight from calculate_tag_weight()

    Returns:
        Boost factor (1.0 = no boost, 1.5 = 50% boost, etc.)
    """
    # Map weight to boost factor
    # weight 1.0 -> boost 1.0 (no boost)
    # weight 1.5 -> boost 1.25
    # weight 2.0 -> boost 1.5
    # weight 3.0 -> boost 2.0
    return min(tag_weight, 3.0)  # Cap at 3.0x boost


# ============================================================================
# Test Functions
# ============================================================================

if __name__ == "__main__":
    # Test jurisdiction validation
    print("Testing jurisdiction validation:")
    print(validate_jurisdiction("CA"))  # (True, None)
    print(validate_jurisdiction("INVALID"))  # (False, error)

    # Test file type validation
    print("\nTesting file type validation:")
    print(validate_file_type("pdf"))  # (True, None)
    print(validate_file_type("exe"))  # (False, error)

    # Test file size validation
    print("\nTesting file size validation:")
    print(validate_file_size(1024 * 1024))  # (True, None)
    print(validate_file_size(200 * 1024 * 1024))  # (False, error)

    # Test tag weight calculation
    print("\nTesting tag weight calculation:")
    print(f"Usage 0: weight={calculate_tag_weight(0):.2f}, boost={get_tag_boost_factor(calculate_tag_weight(0)):.2f}x")
    print(f"Usage 10: weight={calculate_tag_weight(10):.2f}, boost={get_tag_boost_factor(calculate_tag_weight(10)):.2f}x")
    print(f"Usage 100: weight={calculate_tag_weight(100):.2f}, boost={get_tag_boost_factor(calculate_tag_weight(100)):.2f}x")

    # Test complete evidence validation
    print("\nTesting complete evidence validation:")
    result = validate_evidence_file(
        filename="test.pdf",
        file_type="pdf",
        file_size=1024 * 1024,
        jurisdiction="CA"
    )
    print(result)

