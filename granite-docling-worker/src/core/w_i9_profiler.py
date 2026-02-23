"""
W-I9 CPU Profiler for Intel 11th-Gen i7/i9 Optimization
Detects CPU capabilities and applies W-I9 profile configuration
"""

import os
import logging
from dataclasses import dataclass
from typing import Dict, Optional
import multiprocessing

try:
    import cpuinfo
except ImportError:
    cpuinfo = None

logger = logging.getLogger(__name__)


@dataclass
class CPUCapabilities:
    """CPU capability detection results"""
    cores: int
    threads: int
    has_avx2: bool
    has_sse42: bool
    l2_cache_kb: int
    l3_cache_kb: int
    cpu_brand: str
    cpu_model: str
    is_w_i9_compatible: bool


@dataclass
class W_I9Profile:
    """W-I9 optimization profile configuration"""
    worker_threads: int
    batch_size: int
    gpu_batch_size: int
    cpu_batch_size: int
    cache_line_size: int
    simd_enabled: bool
    avx2_enabled: bool
    thread_affinity: bool
    memory_pool_size_mb: int
    gpu_memory_fraction: float
    tesseract_threads: int
    redis_pool_size: int
    minio_parallel_streams: int


class W_I9Profiler:
    """Detects CPU capabilities and applies W-I9 profile"""

    # W-I9 Profile Defaults (Intel 11th-Gen i7/i9)
    DEFAULT_PROFILE = W_I9Profile(
        worker_threads=12,  # Will be auto-detected
        batch_size=32,
        gpu_batch_size=32,
        cpu_batch_size=16,
        cache_line_size=64,
        simd_enabled=True,
        avx2_enabled=True,
        thread_affinity=True,
        memory_pool_size_mb=2048,
        gpu_memory_fraction=0.8,
        tesseract_threads=4,
        redis_pool_size=10,
        minio_parallel_streams=4,
    )

    @staticmethod
    def detect_cpu_capabilities() -> CPUCapabilities:
        """Detect CPU capabilities using cpuinfo"""
        try:
            if cpuinfo:
                info = cpuinfo.get_cpu_info()
                return W_I9Profiler._parse_cpuinfo(info)
            else:
                return W_I9Profiler._detect_fallback()
        except Exception as e:
            logger.warning(f"CPU detection failed: {e}, using fallback")
            return W_I9Profiler._detect_fallback()

    @staticmethod
    def _parse_cpuinfo(info: Dict) -> CPUCapabilities:
        """Parse cpuinfo output"""
        cores = info.get("count", multiprocessing.cpu_count())
        threads = cores  # Assume 1 thread per core for now

        # Check for hyperthreading
        if "flags" in info:
            flags = info["flags"]
            if "ht" in flags or "htt" in flags:
                threads = cores * 2

        has_avx2 = "avx2" in info.get("flags", [])
        has_sse42 = "sse4_2" in info.get("flags", [])

        brand = info.get("brand_raw", "Unknown")
        model = info.get("model", "Unknown")

        # Estimate cache sizes (typical for 11th-Gen)
        l2_cache_kb = cores * 512  # 512KB per core
        l3_cache_kb = 12 * 1024  # 12MB typical

        # Check if W-I9 compatible (11th-Gen Intel)
        is_w_i9 = "11th" in brand or "Core i7" in brand or "Core i9" in brand

        return CPUCapabilities(
            cores=cores,
            threads=threads,
            has_avx2=has_avx2,
            has_sse42=has_sse42,
            l2_cache_kb=l2_cache_kb,
            l3_cache_kb=l3_cache_kb,
            cpu_brand=brand,
            cpu_model=model,
            is_w_i9_compatible=is_w_i9,
        )

    @staticmethod
    def _detect_fallback() -> CPUCapabilities:
        """Fallback CPU detection using multiprocessing"""
        cores = multiprocessing.cpu_count()
        threads = cores * 2  # Assume hyperthreading

        return CPUCapabilities(
            cores=cores,
            threads=threads,
            has_avx2=True,  # Assume AVX2 on modern CPUs
            has_sse42=True,
            l2_cache_kb=cores * 512,
            l3_cache_kb=12 * 1024,
            cpu_brand="Unknown",
            cpu_model="Unknown",
            is_w_i9_compatible=True,  # Assume W-I9 compatible
        )

    @staticmethod
    def create_w_i9_profile(capabilities: Optional[CPUCapabilities] = None) -> W_I9Profile:
        """Create W-I9 profile based on CPU capabilities"""
        if capabilities is None:
            capabilities = W_I9Profiler.detect_cpu_capabilities()

        profile = W_I9Profile(**vars(W_I9Profiler.DEFAULT_PROFILE))

        # Auto-tune worker threads based on core count
        # Reserve 2 cores for system/GPU communication
        available_cores = max(capabilities.cores - 2, 1)
        profile.worker_threads = min(14, max(10, available_cores + 2))

        # Adjust batch sizes based on core count
        if capabilities.cores >= 8:
            profile.batch_size = 32
            profile.gpu_batch_size = 32
            profile.cpu_batch_size = 16
        elif capabilities.cores >= 4:
            profile.batch_size = 16
            profile.gpu_batch_size = 16
            profile.cpu_batch_size = 8
        else:
            profile.batch_size = 8
            profile.gpu_batch_size = 8
            profile.cpu_batch_size = 4

        # Adjust Tesseract threads
        profile.tesseract_threads = max(2, capabilities.cores // 2)

        # Adjust Redis pool size
        profile.redis_pool_size = min(20, capabilities.cores * 2)

        # Enable SIMD if available
        profile.simd_enabled = capabilities.has_sse42
        profile.avx2_enabled = capabilities.has_avx2

        logger.info(f"W-I9 Profile created:")
        logger.info(f"  CPU: {capabilities.cpu_brand}")
        logger.info(f"  Cores: {capabilities.cores}, Threads: {capabilities.threads}")
        logger.info(f"  AVX2: {capabilities.has_avx2}, SSE4.2: {capabilities.has_sse42}")
        logger.info(f"  Worker threads: {profile.worker_threads}")
        logger.info(f"  Batch size: {profile.batch_size}")
        logger.info(f"  SIMD enabled: {profile.simd_enabled}")

        return profile

    @staticmethod
    def log_capabilities(capabilities: CPUCapabilities) -> None:
        """Log CPU capabilities"""
        logger.info("=" * 60)
        logger.info("CPU CAPABILITIES DETECTED")
        logger.info("=" * 60)
        logger.info(f"Brand: {capabilities.cpu_brand}")
        logger.info(f"Model: {capabilities.cpu_model}")
        logger.info(f"Cores: {capabilities.cores}")
        logger.info(f"Threads: {capabilities.threads}")
        logger.info(f"L2 Cache: {capabilities.l2_cache_kb}KB")
        logger.info(f"L3 Cache: {capabilities.l3_cache_kb}KB")
        logger.info(f"AVX2: {capabilities.has_avx2}")
        logger.info(f"SSE4.2: {capabilities.has_sse42}")
        logger.info(f"W-I9 Compatible: {capabilities.is_w_i9_compatible}")
        logger.info("=" * 60)

    @staticmethod
    def apply_thread_affinity(profile: W_I9Profile) -> None:
        """Apply thread affinity settings (Windows-specific)"""
        if not profile.thread_affinity:
            return

        try:
            import psutil

            # Get current process
            p = psutil.Process(os.getpid())

            # Set CPU affinity to all cores
            cpu_count = multiprocessing.cpu_count()
            p.cpu_affinity(list(range(cpu_count)))

            logger.info(f"Thread affinity applied to all {cpu_count} cores")
        except ImportError:
            logger.warning("psutil not available, skipping thread affinity")
        except Exception as e:
            logger.warning(f"Failed to apply thread affinity: {e}")


def get_w_i9_profile() -> W_I9Profile:
    """Get W-I9 profile (convenience function)"""
    capabilities = W_I9Profiler.detect_cpu_capabilities()
    W_I9Profiler.log_capabilities(capabilities)
    profile = W_I9Profiler.create_w_i9_profile(capabilities)
    W_I9Profiler.apply_thread_affinity(profile)
    return profile


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    profile = get_w_i9_profile()
    print(f"\nW-I9 Profile: {profile}")
