"""Metrics collection for processing pipeline."""

import psutil
import time
import structlog
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

logger = structlog.get_logger(__name__)


@dataclass
class SystemMetrics:
    """System resource metrics."""
    cpu_percent: float
    memory_percent: float
    memory_mb: float
    gpu_percent: Optional[float] = None
    gpu_memory_mb: Optional[float] = None
    timestamp: str = ""

    def __post_init__(self):
        """Set timestamp if not provided."""
        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class StageMetrics:
    """Metrics for a processing stage."""
    stage_name: str
    start_time: float
    end_time: Optional[float] = None
    items_processed: int = 0
    items_failed: int = 0
    items_total: int = 0
    system_metrics: Optional[SystemMetrics] = None

    @property
    def duration_seconds(self) -> float:
        """Get stage duration in seconds."""
        end = self.end_time or time.time()
        return end - self.start_time

    @property
    def throughput(self) -> float:
        """Get items processed per second."""
        duration = self.duration_seconds
        if duration == 0:
            return 0
        return self.items_processed / duration

    @property
    def success_rate(self) -> float:
        """Get success rate as percentage."""
        total = self.items_processed + self.items_failed
        if total == 0:
            return 0
        return (self.items_processed / total) * 100

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'stage_name': self.stage_name,
            'duration_seconds': self.duration_seconds,
            'items_processed': self.items_processed,
            'items_failed': self.items_failed,
            'items_total': self.items_total,
            'throughput': self.throughput,
            'success_rate': self.success_rate,
            'system_metrics': self.system_metrics.to_dict() if self.system_metrics else None,
        }


class MetricsCollector:
    """Collects and tracks metrics during processing."""

    def __init__(self):
        """Initialize metrics collector."""
        self._stage_metrics: Dict[str, StageMetrics] = {}
        self._current_stage: Optional[str] = None
        self._start_time = time.time()

    def start_stage(self, stage_name: str) -> None:
        """Start tracking a processing stage."""
        self._current_stage = stage_name
        self._stage_metrics[stage_name] = StageMetrics(
            stage_name=stage_name,
            start_time=time.time(),
        )
        logger.info(f"Stage started: {stage_name}")

    def end_stage(self, stage_name: str) -> None:
        """End tracking a processing stage."""
        if stage_name in self._stage_metrics:
            self._stage_metrics[stage_name].end_time = time.time()
            logger.info(
                f"Stage completed: {stage_name}",
                duration=self._stage_metrics[stage_name].duration_seconds,
            )

    def record_item_processed(self, stage_name: str, count: int = 1) -> None:
        """Record items processed in a stage."""
        if stage_name in self._stage_metrics:
            self._stage_metrics[stage_name].items_processed += count

    def record_item_failed(self, stage_name: str, count: int = 1) -> None:
        """Record items failed in a stage."""
        if stage_name in self._stage_metrics:
            self._stage_metrics[stage_name].items_failed += count

    def set_total_items(self, stage_name: str, total: int) -> None:
        """Set total items for a stage."""
        if stage_name in self._stage_metrics:
            self._stage_metrics[stage_name].items_total = total

    def collect_system_metrics(self, stage_name: str) -> SystemMetrics:
        """Collect current system metrics."""
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            memory_mb = memory.used / (1024 * 1024)

            # Try to get GPU metrics (optional)
            gpu_percent = None
            gpu_memory_mb = None
            try:
                import GPUtil
                gpus = GPUtil.getGPUs()
                if gpus:
                    gpu = gpus[0]
                    gpu_percent = gpu.load * 100
                    gpu_memory_mb = gpu.memoryUsed
            except Exception:
                pass

            metrics = SystemMetrics(
                cpu_percent=cpu_percent,
                memory_percent=memory_percent,
                memory_mb=memory_mb,
                gpu_percent=gpu_percent,
                gpu_memory_mb=gpu_memory_mb,
            )

            # Store in stage metrics
            if stage_name in self._stage_metrics:
                self._stage_metrics[stage_name].system_metrics = metrics

            return metrics
        except Exception as e:
            logger.error("Failed to collect system metrics", error=str(e))
            return SystemMetrics(
                cpu_percent=0,
                memory_percent=0,
                memory_mb=0,
            )

    def get_stage_metrics(self, stage_name: str) -> Optional[Dict[str, Any]]:
        """Get metrics for a specific stage."""
        if stage_name in self._stage_metrics:
            return self._stage_metrics[stage_name].to_dict()
        return None

    def get_all_metrics(self) -> Dict[str, Any]:
        """Get all collected metrics."""
        total_duration = time.time() - self._start_time

        stages = {}
        for stage_name, metrics in self._stage_metrics.items():
            stages[stage_name] = metrics.to_dict()

        return {
            'total_duration_seconds': total_duration,
            'stages': stages,
            'summary': self._get_summary(),
        }

    def _get_summary(self) -> Dict[str, Any]:
        """Get summary metrics."""
        total_processed = sum(m.items_processed for m in self._stage_metrics.values())
        total_failed = sum(m.items_failed for m in self._stage_metrics.values())
        total_items = sum(m.items_total for m in self._stage_metrics.values())

        return {
            'total_processed': total_processed,
            'total_failed': total_failed,
            'total_items': total_items,
            'success_rate': (total_processed / (total_processed + total_failed) * 100) if (total_processed + total_failed) > 0 else 0,
        }


class ProgressTracker:
    """Tracks progress and estimates ETA."""

    def __init__(self, total_items: int):
        """Initialize progress tracker."""
        self.total_items = total_items
        self.processed_items = 0
        self.start_time = time.time()

    def update(self, items_processed: int = 1) -> None:
        """Update progress."""
        self.processed_items += items_processed

    def get_percentage(self) -> int:
        """Get progress percentage."""
        if self.total_items == 0:
            return 0
        return min(100, int((self.processed_items / self.total_items) * 100))

    def get_eta_seconds(self) -> Optional[int]:
        """Get estimated time to completion in seconds."""
        if self.processed_items == 0:
            return None

        elapsed = time.time() - self.start_time
        rate = self.processed_items / elapsed
        remaining = self.total_items - self.processed_items

        if rate == 0:
            return None

        return int(remaining / rate)

    def get_elapsed_seconds(self) -> float:
        """Get elapsed time in seconds."""
        return time.time() - self.start_time
