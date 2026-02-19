"""
Error Handling & Graceful Degradation

Implements fallback logic for failed components and partial result handling.

Usage:
    handler = ErrorHandler()
    result = handler.handle_retrieval_error(error, partial_results)
"""

import logging
from typing import Dict, List, Optional, Any
from enum import Enum

logger = logging.getLogger(__name__)


class ErrorSeverity(Enum):
    """Error severity levels"""

    CRITICAL = "critical"  # System failure
    HIGH = "high"  # Component failure
    MEDIUM = "medium"  # Partial failure
    LOW = "low"  # Degraded performance


class ErrorHandler:
    """Error handling and graceful degradation"""

    def __init__(self):
        """Initialize error handler"""
        logger.info("ErrorHandler initialized")

    def handle_retrieval_error(
        self, error: Exception, partial_results: Optional[List[Dict]] = None
    ) -> Dict:
        """
        Handle retrieval errors with graceful degradation.

        Args:
            error: Exception that occurred
            partial_results: Partial results if available

        Returns:
            Response with error info and partial results
        """
        try:
            error_msg = str(error)
            severity = self._classify_error(error)

            logger.warning(f"Retrieval error ({severity.value}): {error_msg}")

            response = {
                "status": "partial_failure" if partial_results else "failure",
                "error": error_msg,
                "severity": severity.value,
                "partial_results": partial_results or [],
                "num_results": len(partial_results) if partial_results else 0,
                "warning": self._get_warning_message(severity),
            }

            return response

        except Exception as e:
            logger.error(f"Error handling failed: {e}")
            return {
                "status": "failure",
                "error": "Internal error handling failure",
                "severity": ErrorSeverity.CRITICAL.value,
            }

    def handle_component_failure(
        self, component_name: str, error: Exception, fallback_available: bool = False
    ) -> Dict:
        """
        Handle component-specific failures.

        Args:
            component_name: Name of failed component
            error: Exception that occurred
            fallback_available: Whether fallback is available

        Returns:
            Error response with fallback info
        """
        try:
            logger.warning(
                f"Component failure: {component_name}, fallback={fallback_available}"
            )

            return {
                "component": component_name,
                "error": str(error),
                "fallback_available": fallback_available,
                "fallback_message": self._get_fallback_message(
                    component_name, fallback_available
                ),
            }

        except Exception as e:
            logger.error(f"Component error handling failed: {e}")
            return {"component": component_name, "error": "Error handling failed"}

    def _classify_error(self, error: Exception) -> ErrorSeverity:
        """Classify error severity"""
        error_msg = str(error).lower()

        if "cuda" in error_msg or "gpu" in error_msg:
            return ErrorSeverity.HIGH

        if "timeout" in error_msg or "connection" in error_msg:
            return ErrorSeverity.MEDIUM

        if "not found" in error_msg or "missing" in error_msg:
            return ErrorSeverity.LOW

        return ErrorSeverity.MEDIUM

    def _get_warning_message(self, severity: ErrorSeverity) -> str:
        """Get warning message for severity level"""
        messages = {
            ErrorSeverity.CRITICAL: "System failure. Please try again later.",
            ErrorSeverity.HIGH: "Component failure. Using fallback results.",
            ErrorSeverity.MEDIUM: "Partial failure. Some results may be incomplete.",
            ErrorSeverity.LOW: "Degraded performance. Results may be limited.",
        }
        return messages.get(severity, "Unknown error")

    def _get_fallback_message(self, component: str, available: bool) -> str:
        """Get fallback message"""
        if available:
            return f"Using fallback for {component}"
        else:
            return f"No fallback available for {component}"

    def validate_results(self, results: List[Dict]) -> Dict:
        """
        Validate retrieval results.

        Args:
            results: Results to validate

        Returns:
            Validation report
        """
        try:
            issues = []

            if not results:
                issues.append("No results returned")

            for i, result in enumerate(results):
                if not result.get("id"):
                    issues.append(f"Result {i} missing id")

                if not result.get("text"):
                    issues.append(f"Result {i} missing text")

                score = result.get("score")
                if score is None or not (0.0 <= score <= 1.0):
                    issues.append(f"Result {i} invalid score: {score}")

            return {
                "valid": len(issues) == 0,
                "num_results": len(results),
                "issues": issues,
            }

        except Exception as e:
            logger.error(f"Result validation failed: {e}")
            return {"valid": False, "error": str(e)}

    def log_error(
        self, error: Exception, context: Optional[Dict] = None, level: str = "error"
    ) -> None:
        """
        Log error with context.

        Args:
            error: Exception to log
            context: Additional context
            level: Log level (error, warning, info)
        """
        try:
            log_msg = f"{str(error)}"
            if context:
                log_msg += f" | Context: {context}"

            if level == "error":
                logger.error(log_msg)
            elif level == "warning":
                logger.warning(log_msg)
            else:
                logger.info(log_msg)

        except Exception as e:
            logger.error(f"Error logging failed: {e}")


# Singleton instance
_error_handler = None


def get_error_handler() -> ErrorHandler:
    """Get or create singleton error handler"""
    global _error_handler
    if _error_handler is None:
        _error_handler = ErrorHandler()
    return _error_handler
