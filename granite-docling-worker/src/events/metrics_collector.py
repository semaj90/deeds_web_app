"""
Metrics collection for processing pipeline.

Collects GPU/CPU utilization, memory usage, and performance metrics.
"""

import logging
import psutil
import threading
from typing import Optional, Dict, Any
from dataclasses import dataclass
from datetime import datetime

from .event_models import Metrics

logger = logging.getLogger(__name__)


@dataclass
class ProcessMetrics:
    """Process-level metrics."""

    cpu_percent: float
    memory_mb: float
    memory_percent: float


class MetricsCollector:
    """
    Metrics collector for processing pipeline.

    Collects GPU/CPU utilization, memory usage, and performance metrics.
    """

    def __init__(self, sample_interval: float = 1.0):
        """
        Initialize metrics collector.

        Args:
            sample_interval: Sampling interval in seconds
        """
        self.sample_interval = sample_interval
        self.process = psutil.Process()
        self.gpu_available = self._check_gpu_availability()
        self.monitoring = False
        self.monitor_thread = None

        # Metrics storage
        self.current_metrics = Metrics()
        self.metrics_history: list[Metrics] = []

        logger.info(f"Initialized MetricsCollector (GPU available: {self.gpu_available})")

    def start_monitoring(self) -> None:
        """Start background metrics monitoring."""
        if self.monitoring:
            return

        self.monitoring = True
        self.monitor_thread = threading.Thread(
            target=self._monitor_loop,
            daemon=True,
        )
        self.monitor_thread.start()
        logger.info("Started metrics monitoring")

    def stop_monitoring(self) -> None:
        """Stop background metrics monitoring."""
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5)
        logger.info("Stopped metrics monitoring")

    def _monitor_loop(self) -> None:
        """Background monitoring loop."""
        import time

        while self.monitoring:
            try:
                self.current_metrics = self._collect_metrics()
                self.metrics_history.append(self.current_metrics)

                # Keep only last 100 samples
                if len(self.metrics_history) > 100:
                    self.metrics_history.pop(0)

                time.sleep(self.sample_interval)
            except Exception as e:
                logger.error(f"Error collecting metrics: {e}")

    def _collect_metrics(self) -> Metrics:
        """Collect current metrics."""
        # CPU and memory
        cpu_percent = self.process.cpu_percent(interval=0.1)
        memory_info = self.process.memory_info()
        memory_mb = memory_info.rss / 1024 / 1024

        # GPU metrics
        gpu_util = 0.0
        if self.gpu_available:
            gpu_util = self._get_gpu_utilization()

        return Metrics(
            gpu_utilization=gpu_util,
            cpu_utilization=cpu_percent,
            memory_usage_mb=memory_mb,
        )

    def _check_gpu_availability(self) -> bool:
        """Check if GPU is available."""
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False

    def _get_gpu_utilization(self) -> float:
        """Get GPU utilization percentage."""
        try:
            import torch

            if not torch.cuda.is_available():
                return 0.0

            # Try to get GPU memory usage
            allocated = torch.cuda.memory_allocated() / torch.cuda.get_device_properties(0).total_memory
            return allocated * 100
        except Exception as e:
            logger.debug(f"Error getting GPU utilization: {e}")
            return 0.0

    def get_current_metrics(self) -> Metrics:
        """Get current metrics."""
        return self._collect_metrics()

    def get_average_metrics(self) -> Metrics:
        """Get average metrics from history."""
        if not self.metrics_history:
            return Metrics()

        avg_gpu = sum(m.gpu_utilization for m in self.metrics_history) / len(self.metrics_history)
        avg_cpu = sum(m.cpu_utilization for m in self.metrics_history) / len(self.metrics_history)
        avg_memory = sum(m.memory_usage_mb for m in self.metrics_history) / len(self.metrics_history)

        return Metrics(
            gpu_utilization=avg_gpu,
            cpu_utilization=avg_cpu,
            memory_usage_mb=avg_memory,
        )

    def get_peak_metrics(self) -> Metrics:
        """Get peak metrics from history."""
        if not self.metrics_history:
            return Metrics()

        peak_gpu = max(m.gpu_utilization for m in self.metrics_history)
        peak_cpu = max(m.cpu_utilization for m in self.metrics_history)
        peak_memory = max(m.memory_usage_mb for m in self.metrics_history)

        return Metrics(
            gpu_utilization=peak_gpu,
            cpu_utilization=peak_cpu,
            memory_usage_mb=peak_memory,
        )

    def get_statistics(self) -> Dict[str, Any]:
        """Get metrics statistics."""
        if not self.metrics_history:
            return {}

        return {
            'current': self.get_current_metrics().to_dict(),
            'average': self.get_average_metrics().to_dict(),
            'peak': self.get_peak_metrics().to_dict(),
            'samples': len(self.metrics_history),
            'gpu_available': self.gpu_available,
        }
