"""Error handling and recovery mechanisms."""

import asyncio
import structlog
from typing import Callable, Any, Optional, TypeVar, Coroutine
from enum import Enum
import time

logger = structlog.get_logger(__name__)

T = TypeVar('T')


class ErrorSeverity(str, Enum):
    """Error severity levels."""
    WARNING = "warning"
    RECOVERABLE = "recoverable"
    CRITICAL = "critical"


class ProcessingError(Exception):
    """Base exception for processing errors."""

    def __init__(
        self,
        stage: str,
        message: str,
        severity: ErrorSeverity = ErrorSeverity.RECOVERABLE,
        details: Optional[dict] = None,
    ):
        """Initialize processing error."""
        self.stage = stage
        self.message = message
        self.severity = severity
        self.details = details or {}
        super().__init__(message)

    def is_recoverable(self) -> bool:
        """Check if error is recoverable."""
        return self.severity != ErrorSeverity.CRITICAL

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            'stage': self.stage,
            'message': self.message,
            'severity': self.severity.value,
            'details': self.details,
        }


class RetryConfig:
    """Configuration for retry logic."""

    def __init__(
        self,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
    ):
        """Initialize retry config."""
        self.max_retries = max_retries
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter

    def get_delay(self, attempt: int) -> float:
        """Calculate delay for attempt."""
        delay = min(
            self.initial_delay * (self.exponential_base ** attempt),
            self.max_delay,
        )

        if self.jitter:
            import random
            delay = delay * (0.5 + random.random())

        return delay


async def retry_with_backoff(
    fn: Callable[..., Coroutine[Any, Any, T]],
    *args,
    config: Optional[RetryConfig] = None,
    on_retry: Optional[Callable[[int, Exception], Any]] = None,
    **kwargs,
) -> T:
    """Retry a coroutine with exponential backoff.

    Args:
        fn: Async function to retry
        *args: Positional arguments for fn
        config: Retry configuration
        on_retry: Callback on retry attempt
        **kwargs: Keyword arguments for fn

    Returns:
        Result of fn

    Raises:
        Last exception if all retries fail
    """
    if config is None:
        config = RetryConfig()

    last_exception = None

    for attempt in range(config.max_retries + 1):
        try:
            return await fn(*args, **kwargs)
        except Exception as e:
            last_exception = e

            if attempt < config.max_retries:
                delay = config.get_delay(attempt)
                logger.warning(
                    f"Retry attempt {attempt + 1}/{config.max_retries}",
                    error=str(e),
                    delay=delay,
                )

                if on_retry:
                    await on_retry(attempt + 1, e)

                await asyncio.sleep(delay)
            else:
                logger.error(
                    f"All retry attempts failed",
                    error=str(e),
                    attempts=config.max_retries + 1,
                )

    raise last_exception


class CheckpointManager:
    """Manages processing checkpoints for recovery."""

    def __init__(self):
        """Initialize checkpoint manager."""
        self._checkpoints: dict = {}

    async def save_checkpoint(
        self,
        job_id: str,
        stage: str,
        data: dict,
    ) -> None:
        """Save a checkpoint."""
        if job_id not in self._checkpoints:
            self._checkpoints[job_id] = {}

        self._checkpoints[job_id][stage] = {
            'timestamp': time.time(),
            'data': data,
        }

        logger.info(f"Checkpoint saved", job_id=job_id, stage=stage)

    async def get_checkpoint(
        self,
        job_id: str,
        stage: str,
    ) -> Optional[dict]:
        """Get a checkpoint."""
        if job_id in self._checkpoints and stage in self._checkpoints[job_id]:
            return self._checkpoints[job_id][stage]['data']
        return None

    async def has_checkpoint(
        self,
        job_id: str,
        stage: str,
    ) -> bool:
        """Check if checkpoint exists."""
        return (
            job_id in self._checkpoints
            and stage in self._checkpoints[job_id]
        )

    async def clear_checkpoints(self, job_id: str) -> None:
        """Clear all checkpoints for a job."""
        if job_id in self._checkpoints:
            del self._checkpoints[job_id]
            logger.info(f"Checkpoints cleared", job_id=job_id)

    async def get_last_completed_stage(self, job_id: str) -> Optional[str]:
        """Get the last completed stage."""
        if job_id not in self._checkpoints:
            return None

        stages = list(self._checkpoints[job_id].keys())
        if stages:
            return stages[-1]
        return None


class CircuitBreaker:
    """Circuit breaker for handling cascading failures."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
    ):
        """Initialize circuit breaker."""
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failure_count = 0
        self._last_failure_time: Optional[float] = None
        self._state = "closed"  # closed, open, half-open

    async def call(
        self,
        fn: Callable[..., Coroutine[Any, Any, T]],
        *args,
        **kwargs,
    ) -> T:
        """Call function with circuit breaker protection."""
        if self._state == "open":
            # Check if recovery timeout has passed
            if (
                self._last_failure_time
                and time.time() - self._last_failure_time > self.recovery_timeout
            ):
                self._state = "half-open"
                logger.info("Circuit breaker entering half-open state")
            else:
                raise Exception("Circuit breaker is open")

        try:
            result = await fn(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise

    def _on_success(self) -> None:
        """Handle successful call."""
        self._failure_count = 0
        self._state = "closed"

    def _on_failure(self) -> None:
        """Handle failed call."""
        self._failure_count += 1
        self._last_failure_time = time.time()

        if self._failure_count >= self.failure_threshold:
            self._state = "open"
            logger.error(
                "Circuit breaker opened",
                failure_count=self._failure_count,
            )

    def is_open(self) -> bool:
        """Check if circuit breaker is open."""
        return self._state == "open"


# Global checkpoint manager
_checkpoint_manager: Optional[CheckpointManager] = None


async def get_checkpoint_manager() -> CheckpointManager:
    """Get or create the global checkpoint manager."""
    global _checkpoint_manager
    if _checkpoint_manager is None:
        _checkpoint_manager = CheckpointManager()
    return _checkpoint_manager
