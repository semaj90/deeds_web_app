"""Error handling and recovery module."""

from evidence_pipeline.error_handling.recovery import (
    ProcessingError,
    ErrorSeverity,
    RetryConfig,
    retry_with_backoff,
    CheckpointManager,
    CircuitBreaker,
    get_checkpoint_manager,
)
from evidence_pipeline.error_handling.middleware import (
    ErrorHandlingMiddleware,
    RequestLoggingMiddleware,
)

__all__ = [
    'ProcessingError',
    'ErrorSeverity',
    'RetryConfig',
    'retry_with_backoff',
    'CheckpointManager',
    'CircuitBreaker',
    'get_checkpoint_manager',
    'ErrorHandlingMiddleware',
    'RequestLoggingMiddleware',
]
