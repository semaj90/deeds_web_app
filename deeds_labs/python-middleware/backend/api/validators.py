"""
Request Validation

Validates query format, length, and parameter ranges.

Usage:
    validator = RequestValidator()
    is_valid, errors = validator.validate_search_request(request)
"""

import logging
from typing import Dict, List, Tuple, Optional
import re

logger = logging.getLogger(__name__)


class RequestValidator:
    """Request validation"""

    # Configuration
    MIN_QUERY_LENGTH = 1
    MAX_QUERY_LENGTH = 1000
    MIN_TOP_K = 1
    MAX_TOP_K = 100
    MIN_CONFIDENCE = 0.0
    MAX_CONFIDENCE = 1.0

    def __init__(self):
        """Initialize request validator"""
        logger.info("RequestValidator initialized")

    def validate_search_request(self, request: Dict) -> Tuple[bool, List[str]]:
        """
        Validate search request.

        Args:
            request: Search request

        Returns:
            Tuple of (is_valid, errors)
        """
        errors = []

        try:
            # Check required fields
            if "query" not in request:
                errors.append("Missing required field: query")
            else:
                query_errors = self._validate_query(request["query"])
                errors.extend(query_errors)

            # Check optional fields
            if "top_k" in request:
                top_k_errors = self._validate_top_k(request["top_k"])
                errors.extend(top_k_errors)

            if "confidence_threshold" in request:
                conf_errors = self._validate_confidence(request["confidence_threshold"])
                errors.extend(conf_errors)

            is_valid = len(errors) == 0

            if is_valid:
                logger.debug("Search request validation passed")
            else:
                logger.warning(f"Search request validation failed: {errors}")

            return is_valid, errors

        except Exception as e:
            logger.error(f"Validation failed: {e}")
            return False, [str(e)]

    def validate_3d_request(self, request: Dict) -> Tuple[bool, List[str]]:
        """
        Validate 3D memory request.

        Args:
            request: 3D memory request

        Returns:
            Tuple of (is_valid, errors)
        """
        errors = []

        try:
            # Check required fields
            if "embeddings" not in request:
                errors.append("Missing required field: embeddings")
            else:
                emb_errors = self._validate_embeddings(request["embeddings"])
                errors.extend(emb_errors)

            # Check optional rotation fields
            for field in ["rotation_roll", "rotation_pitch", "rotation_yaw"]:
                if field in request:
                    rot_errors = self._validate_rotation(request[field], field)
                    errors.extend(rot_errors)

            is_valid = len(errors) == 0

            if is_valid:
                logger.debug("3D request validation passed")
            else:
                logger.warning(f"3D request validation failed: {errors}")

            return is_valid, errors

        except Exception as e:
            logger.error(f"3D validation failed: {e}")
            return False, [str(e)]

    def validate_cartridge_request(self, request: Dict) -> Tuple[bool, List[str]]:
        """
        Validate cartridge request.

        Args:
            request: Cartridge request

        Returns:
            Tuple of (is_valid, errors)
        """
        errors = []

        try:
            # Check required fields
            if "query" not in request:
                errors.append("Missing required field: query")
            else:
                query_errors = self._validate_query(request["query"])
                errors.extend(query_errors)

            if "results" not in request:
                errors.append("Missing required field: results")
            else:
                results_errors = self._validate_results(request["results"])
                errors.extend(results_errors)

            is_valid = len(errors) == 0

            if is_valid:
                logger.debug("Cartridge request validation passed")
            else:
                logger.warning(f"Cartridge request validation failed: {errors}")

            return is_valid, errors

        except Exception as e:
            logger.error(f"Cartridge validation failed: {e}")
            return False, [str(e)]

    def _validate_query(self, query: str) -> List[str]:
        """Validate query string"""
        errors = []

        if not isinstance(query, str):
            errors.append(f"Query must be string, got {type(query)}")
            return errors

        if len(query) < self.MIN_QUERY_LENGTH:
            errors.append(f"Query too short (min {self.MIN_QUERY_LENGTH})")

        if len(query) > self.MAX_QUERY_LENGTH:
            errors.append(f"Query too long (max {self.MAX_QUERY_LENGTH})")

        if not query.strip():
            errors.append("Query cannot be empty or whitespace only")

        return errors

    def _validate_top_k(self, top_k: int) -> List[str]:
        """Validate top_k parameter"""
        errors = []

        if not isinstance(top_k, int):
            errors.append(f"top_k must be integer, got {type(top_k)}")
            return errors

        if top_k < self.MIN_TOP_K:
            errors.append(f"top_k too small (min {self.MIN_TOP_K})")

        if top_k > self.MAX_TOP_K:
            errors.append(f"top_k too large (max {self.MAX_TOP_K})")

        return errors

    def _validate_confidence(self, confidence: float) -> List[str]:
        """Validate confidence threshold"""
        errors = []

        if not isinstance(confidence, (int, float)):
            errors.append(f"Confidence must be number, got {type(confidence)}")
            return errors

        if confidence < self.MIN_CONFIDENCE:
            errors.append(f"Confidence too low (min {self.MIN_CONFIDENCE})")

        if confidence > self.MAX_CONFIDENCE:
            errors.append(f"Confidence too high (max {self.MAX_CONFIDENCE})")

        return errors

    def _validate_embeddings(self, embeddings: List) -> List[str]:
        """Validate embeddings"""
        errors = []

        if not isinstance(embeddings, list):
            errors.append(f"Embeddings must be list, got {type(embeddings)}")
            return errors

        if len(embeddings) == 0:
            errors.append("Embeddings list cannot be empty")
            return errors

        # Check first embedding
        first = embeddings[0]
        if not isinstance(first, list):
            errors.append(f"Embedding must be list, got {type(first)}")
            return errors

        if len(first) not in [3, 4, 768]:
            errors.append(f"Embedding dimension must be 3, 4, or 768, got {len(first)}")

        return errors

    def _validate_rotation(self, rotation: float, field: str) -> List[str]:
        """Validate rotation parameter"""
        errors = []

        if not isinstance(rotation, (int, float)):
            errors.append(f"{field} must be number, got {type(rotation)}")

        return errors

    def _validate_results(self, results: List) -> List[str]:
        """Validate results list"""
        errors = []

        if not isinstance(results, list):
            errors.append(f"Results must be list, got {type(results)}")
            return errors

        if len(results) == 0:
            errors.append("Results list cannot be empty")
            return errors

        # Check first result
        first = results[0]
        if not isinstance(first, dict):
            errors.append(f"Result must be dict, got {type(first)}")
            return errors

        required_fields = ["id", "text", "score"]
        for field in required_fields:
            if field not in first:
                errors.append(f"Result missing required field: {field}")

        return errors

    def get_error_message(self, errors: List[str]) -> str:
        """Get formatted error message"""
        if not errors:
            return "No errors"

        return "; ".join(errors)


# Singleton instance
_request_validator = None


def get_request_validator() -> RequestValidator:
    """Get or create singleton request validator"""
    global _request_validator
    if _request_validator is None:
        _request_validator = RequestValidator()
    return _request_validator
