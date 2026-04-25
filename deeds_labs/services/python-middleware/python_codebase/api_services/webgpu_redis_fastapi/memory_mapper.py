# Multi-tensor caching with memory mapping for reinforcement learning
import asyncio
import json
import mmap
import os
import struct
import time
import threading
from typing import Dict, List, Optional, Any, Tuple, Union
from dataclasses import dataclass, asdict
from enum import Enum
import numpy as np
import torch
from concurrent.futures import ThreadPoolExecutor
import redis.asyncio as redis
from contextlib import asynccontextmanager
import pickle
import lz4.frame
import hashlib

class TensorLocation(Enum):
    GPU = "gpu"
    REDIS = "redis"
    MINIO = "minio"
    DISK_MMAP = "disk_mmap"
    SHARED_MEMORY = "shared_memory"

class CompressionType(Enum):
    NONE = "none"
    FLOAT16 = "float16"
    INT8 = "int8"
    LZ4 = "lz4"
    BFLOAT16 = "bfloat16"

@dataclass
class TensorMetadata:
    tensor_id: str
    shape: Tuple[int, ...]
    dtype: str
    compression: CompressionType
    location: TensorLocation
    size_bytes: int
    creation_time: float
    last_access: float
    access_count: int
    parent_computation: Optional[str] = None
    rl_value: Optional[float] = None
    gpu_device_id: Optional[int] = None
    mmap_offset: Optional[int] = None
    mmap_length: Optional[int] = None

@dataclass
class ComputationGraph:
    computation_id: str
    input_tensors: List[str]
    output_tensors: List[str]
    operation_type: str
    model_config: Dict[str, Any]
    gpu_time_ms: float
    memory_peak_mb: float
    accuracy_score: Optional[float] = None
    rl_reward: Optional[float] = None
    reuse_count: int = 0

class MemoryMappedTensorCache:
    """Advanced multi-tier tensor caching with memory mapping and RL optimization"""

    def __init__(
        self,
        base_path: str = "/tmp/tensor_cache",
        max_memory_gb: float = 8.0,
        redis_url: str = "redis://localhost:6379"
    ):
        self.base_path = base_path
        self.max_memory_bytes = int(max_memory_gb * 1024 * 1024 * 1024)
        self.redis_url = redis_url

        # Storage structures
        self.tensor_metadata: Dict[str, TensorMetadata] = {}
        self.computation_graphs: Dict[str, ComputationGraph] = {}
        self.mmap_files: Dict[str, mmap.mmap] = {}
        self.file_handles: Dict[str, Any] = {}

        # Memory management
        self.current_memory_usage = 0
        self.lru_order: List[str] = []
        self.access_lock = threading.RLock()

        # Redis connection
        self.redis_client: Optional[redis.Redis] = None

        # GPU memory tracking
        self.gpu_tensors: Dict[str, torch.Tensor] = {}
        self.gpu_memory_usage = 0

        # Thread pool for async operations
        self.executor = ThreadPoolExecutor(max_workers=4)

        # Compression handlers
        self.compression_handlers = {
            CompressionType.FLOAT16: self._compress_float16,
            CompressionType.INT8: self._compress_int8,
            CompressionType.LZ4: self._compress_lz4,
            CompressionType.BFLOAT16: self._compress_bfloat16
        }

        self.decompression_handlers = {
            CompressionType.FLOAT16: self._decompress_float16,
            CompressionType.INT8: self._decompress_int8,
            CompressionType.LZ4: self._decompress_lz4,
            CompressionType.BFLOAT16: self._decompress_bfloat16
        }

        os.makedirs(base_path, exist_ok=True)

    async def initialize(self):
        """Initialize Redis connection and load existing metadata"""
        self.redis_client = await redis.from_url(
            self.redis_url,
            password=os.getenv("REDIS_PASSWORD", "redis")
        )

        # Load existing metadata from Redis
        await self._load_metadata()
        print(f"MemoryMappedTensorCache initialized with {len(self.tensor_metadata)} tensors")

    async def store_tensor(
        self,
        tensor_id: str,
        data: Union[np.ndarray, torch.Tensor],
        location_preference: TensorLocation = TensorLocation.DISK_MMAP,
        compression: CompressionType = CompressionType.FLOAT16,
        parent_computation: Optional[str] = None,
        rl_value: Optional[float] = None
    ) -> TensorMetadata:
        """Store tensor with specified location and compression"""

        # Convert to numpy if needed
        if isinstance(data, torch.Tensor):
            np_data = data.detach().cpu().numpy()
        else:
            np_data = data

        # Apply compression
        compressed_data, actual_compression = await self._compress_tensor(np_data, compression)

        # Calculate storage requirements
        storage_size = len(compressed_data)

        # Choose optimal storage location
        optimal_location = await self._choose_storage_location(
            storage_size, location_preference, rl_value
        )

        # Store tensor
        metadata = TensorMetadata(
            tensor_id=tensor_id,
            shape=np_data.shape,
            dtype=str(np_data.dtype),
            compression=actual_compression,
            location=optimal_location,
            size_bytes=storage_size,
            creation_time=time.time(),
            last_access=time.time(),
            access_count=1,
            parent_computation=parent_computation,
            rl_value=rl_value
        )

        if optimal_location == TensorLocation.GPU:
            await self._store_gpu(tensor_id, data, metadata)
        elif optimal_location == TensorLocation.REDIS:
            await self._store_redis(tensor_id, compressed_data, metadata)
        elif optimal_location == TensorLocation.DISK_MMAP:
            await self._store_mmap(tensor_id, compressed_data, metadata)
        elif optimal_location == TensorLocation.SHARED_MEMORY:
            await self._store_shared_memory(tensor_id, compressed_data, metadata)

        # Update metadata
        with self.access_lock:
            self.tensor_metadata[tensor_id] = metadata
            self._update_lru(tensor_id)

        # Store metadata in Redis
        await self._save_metadata(tensor_id, metadata)

        return metadata

    async def get_tensor(
        self,
        tensor_id: str,
        target_location: Optional[TensorLocation] = None,
        promote_to_gpu: bool = False
    ) -> Optional[np.ndarray]:
        """Retrieve tensor, optionally promoting to better cache tier"""

        if tensor_id not in self.tensor_metadata:
            return None

        metadata = self.tensor_metadata[tensor_id]

        # Update access pattern
        with self.access_lock:
            metadata.last_access = time.time()
            metadata.access_count += 1
            self._update_lru(tensor_id)

        # Load tensor data
        if metadata.location == TensorLocation.GPU:
            data = await self._load_gpu(tensor_id, metadata)
        elif metadata.location == TensorLocation.REDIS:
            data = await self._load_redis(tensor_id, metadata)
        elif metadata.location == TensorLocation.DISK_MMAP:
            data = await self._load_mmap(tensor_id, metadata)
        elif metadata.location == TensorLocation.SHARED_MEMORY:
            data = await self._load_shared_memory(tensor_id, metadata)
        else:
            return None

        # Decompress if needed
        if metadata.compression != CompressionType.NONE:
            data = await self._decompress_tensor(data, metadata)

        # Promote to GPU if requested and beneficial
        if promote_to_gpu and metadata.location != TensorLocation.GPU:
            await self._promote_to_gpu(tensor_id, data, metadata)

        return data

    async def store_computation_graph(
        self,
        computation_id: str,
        input_tensors: List[str],
        output_tensors: List[str],
        operation_type: str,
        model_config: Dict[str, Any],
        performance_metrics: Dict[str, float]
    ) -> ComputationGraph:
        """Store computation graph for RL optimization"""

        graph = ComputationGraph(
            computation_id=computation_id,
            input_tensors=input_tensors,
            output_tensors=output_tensors,
            operation_type=operation_type,
            model_config=model_config,
            gpu_time_ms=performance_metrics.get("gpu_time_ms", 0),
            memory_peak_mb=performance_metrics.get("memory_peak_mb", 0),
            accuracy_score=performance_metrics.get("accuracy", None),
            rl_reward=performance_metrics.get("rl_reward", None)
        )

        self.computation_graphs[computation_id] = graph

        # Store in Redis
        await self.redis_client.setex(
            f"computation:{computation_id}",
            86400,  # 24 hour TTL
            json.dumps(asdict(graph))
        )

        return graph

    async def find_reusable_computations(
        self,
        operation_type: str,
        model_config: Dict[str, Any],
        similarity_threshold: float = 0.8
    ) -> List[ComputationGraph]:
        """Find reusable computations for given operation and config"""

        candidates = []

        for comp_id, graph in self.computation_graphs.items():
            if graph.operation_type != operation_type:
                continue

            # Calculate config similarity
            similarity = self._calculate_config_similarity(model_config, graph.model_config)

            if similarity >= similarity_threshold:
                candidates.append(graph)

        # Sort by RL reward and reuse count
        candidates.sort(
            key=lambda x: (x.rl_reward or 0, x.reuse_count),
            reverse=True
        )

        return candidates[:5]  # Top 5 candidates

    async def optimize_memory_layout(self) -> Dict[str, Any]:
        """Optimize memory layout based on access patterns and RL values"""

        optimizations = {
            "promoted_to_gpu": [],
            "demoted_from_gpu": [],
            "compressed": [],
            "memory_saved_mb": 0
        }

        # Analyze access patterns
        hot_tensors = self._analyze_hot_tensors()
        cold_tensors = self._analyze_cold_tensors()

        # Promote frequently accessed tensors with high RL value
        for tensor_id in hot_tensors:
            metadata = self.tensor_metadata.get(tensor_id)
            if (metadata and
                metadata.location != TensorLocation.GPU and
                (metadata.rl_value or 0) > 0.7):

                tensor_data = await self.get_tensor(tensor_id)
                if tensor_data is not None:
                    await self._promote_to_gpu(tensor_id, tensor_data, metadata)
                    optimizations["promoted_to_gpu"].append(tensor_id)

        # Demote cold tensors from GPU
        for tensor_id in cold_tensors:
            metadata = self.tensor_metadata.get(tensor_id)
            if metadata and metadata.location == TensorLocation.GPU:
                await self._demote_from_gpu(tensor_id, metadata)
                optimizations["demoted_from_gpu"].append(tensor_id)

        # Compress large, infrequently accessed tensors
        for tensor_id, metadata in self.tensor_metadata.items():
            if (metadata.size_bytes > 10 * 1024 * 1024 and  # > 10MB
                metadata.access_count < 5 and
                metadata.compression == CompressionType.NONE):

                await self._recompress_tensor(tensor_id, CompressionType.LZ4)
                optimizations["compressed"].append(tensor_id)

        return optimizations

    async def get_rl_training_data(self) -> Dict[str, Any]:
        """Extract training data for reinforcement learning"""

        training_data = {
            "tensor_access_patterns": [],
            "computation_performance": [],
            "memory_efficiency_metrics": [],
            "cache_hit_rates": {}
        }

        # Extract tensor access patterns
        for tensor_id, metadata in self.tensor_metadata.items():
            access_pattern = {
                "tensor_id": tensor_id,
                "shape": metadata.shape,
                "access_count": metadata.access_count,
                "age_hours": (time.time() - metadata.creation_time) / 3600,
                "last_access_hours": (time.time() - metadata.last_access) / 3600,
                "location": metadata.location.value,
                "compression": metadata.compression.value,
                "rl_value": metadata.rl_value or 0,
                "size_mb": metadata.size_bytes / (1024 * 1024)
            }
            training_data["tensor_access_patterns"].append(access_pattern)

        # Extract computation performance
        for comp_id, graph in self.computation_graphs.items():
            perf_data = {
                "computation_id": comp_id,
                "operation_type": graph.operation_type,
                "input_count": len(graph.input_tensors),
                "output_count": len(graph.output_tensors),
                "gpu_time_ms": graph.gpu_time_ms,
                "memory_peak_mb": graph.memory_peak_mb,
                "accuracy_score": graph.accuracy_score or 0,
                "rl_reward": graph.rl_reward or 0,
                "reuse_count": graph.reuse_count
            }
            training_data["computation_performance"].append(perf_data)

        # Calculate cache hit rates by location
        location_stats = {}
        for metadata in self.tensor_metadata.values():
            loc = metadata.location.value
            if loc not in location_stats:
                location_stats[loc] = {"hits": 0, "total": 0}
            location_stats[loc]["total"] += metadata.access_count
            location_stats[loc]["hits"] += metadata.access_count  # All accesses are hits

        training_data["cache_hit_rates"] = {
            loc: stats["hits"] / max(stats["total"], 1)
            for loc, stats in location_stats.items()
        }

        return training_data

    # Private helper methods

    async def _compress_tensor(
        self,
        data: np.ndarray,
        compression: CompressionType
    ) -> Tuple[bytes, CompressionType]:
        """Compress tensor data"""

        if compression == CompressionType.NONE:
            return data.tobytes(), CompressionType.NONE

        handler = self.compression_handlers.get(compression)
        if handler:
            return await handler(data), compression
        else:
            # Fallback to no compression
            return data.tobytes(), CompressionType.NONE

    async def _decompress_tensor(
        self,
        data: bytes,
        metadata: TensorMetadata
    ) -> np.ndarray:
        """Decompress tensor data"""

        if metadata.compression == CompressionType.NONE:
            return np.frombuffer(data, dtype=metadata.dtype).reshape(metadata.shape)

        handler = self.decompression_handlers.get(metadata.compression)
        if handler:
            return await handler(data, metadata)
        else:
            raise ValueError(f"Unknown compression type: {metadata.compression}")

    async def _compress_float16(self, data: np.ndarray) -> bytes:
        """Compress to float16"""
        return data.astype(np.float16).tobytes()

    async def _decompress_float16(self, data: bytes, metadata: TensorMetadata) -> np.ndarray:
        """Decompress from float16"""
        float16_data = np.frombuffer(data, dtype=np.float16)
        return float16_data.astype(metadata.dtype).reshape(metadata.shape)

    async def _compress_int8(self, data: np.ndarray) -> bytes:
        """Quantize and compress to int8"""
        # Calculate scale factor
        data_max = np.max(np.abs(data))
        scale = data_max / 127.0 if data_max > 0 else 1.0

        # Quantize
        quantized = np.round(data / scale * 127).astype(np.int8)

        # Pack scale + quantized data
        scale_bytes = struct.pack('f', scale)
        return scale_bytes + quantized.tobytes()

    async def _decompress_int8(self, data: bytes, metadata: TensorMetadata) -> np.ndarray:
        """Decompress from int8"""
        scale = struct.unpack('f', data[:4])[0]
        quantized = np.frombuffer(data[4:], dtype=np.int8)
        return (quantized.astype(np.float32) / 127.0 * scale).reshape(metadata.shape)

    async def _compress_lz4(self, data: np.ndarray) -> bytes:
        """Compress using LZ4"""
        return lz4.frame.compress(data.tobytes())

    async def _decompress_lz4(self, data: bytes, metadata: TensorMetadata) -> np.ndarray:
        """Decompress from LZ4"""
        decompressed = lz4.frame.decompress(data)
        return np.frombuffer(decompressed, dtype=metadata.dtype).reshape(metadata.shape)

    async def _compress_bfloat16(self, data: np.ndarray) -> bytes:
        """Compress to bfloat16"""
        # Convert to bfloat16 (simplified)
        float32_data = data.astype(np.float32)
        int32_view = float32_data.view(np.int32)
        bfloat16_int = (int32_view >> 16).astype(np.int16)
        return bfloat16_int.tobytes()

    async def _decompress_bfloat16(self, data: bytes, metadata: TensorMetadata) -> np.ndarray:
        """Decompress from bfloat16"""
        bfloat16_int = np.frombuffer(data, dtype=np.int16)
        int32_data = bfloat16_int.astype(np.int32) << 16
        float32_data = int32_data.view(np.float32)
        return float32_data.astype(metadata.dtype).reshape(metadata.shape)

    async def _choose_storage_location(
        self,
        size_bytes: int,
        preference: TensorLocation,
        rl_value: Optional[float]
    ) -> TensorLocation:
        """Choose optimal storage location based on size, preference, and RL value"""

        # High RL value tensors prefer GPU
        if rl_value and rl_value > 0.8 and size_bytes < 100 * 1024 * 1024:  # < 100MB
            return TensorLocation.GPU

        # Large tensors go to disk
        if size_bytes > 500 * 1024 * 1024:  # > 500MB
            return TensorLocation.DISK_MMAP

        # Medium tensors can go to Redis
        if size_bytes < 50 * 1024 * 1024:  # < 50MB
            return TensorLocation.REDIS

        # Default to preference
        return preference

    def _analyze_hot_tensors(self, top_n: int = 10) -> List[str]:
        """Identify frequently accessed tensors"""
        tensor_scores = []

        for tensor_id, metadata in self.tensor_metadata.items():
            # Score based on access frequency and recency
            age_hours = (time.time() - metadata.creation_time) / 3600
            recency_hours = (time.time() - metadata.last_access) / 3600

            score = (metadata.access_count / max(age_hours, 1)) / max(recency_hours, 0.1)
            if metadata.rl_value:
                score *= (1 + metadata.rl_value)

            tensor_scores.append((tensor_id, score))

        tensor_scores.sort(key=lambda x: x[1], reverse=True)
        return [tensor_id for tensor_id, _ in tensor_scores[:top_n]]

    def _analyze_cold_tensors(self, threshold_hours: float = 24) -> List[str]:
        """Identify cold tensors that haven't been accessed recently"""
        current_time = time.time()
        cold_tensors = []

        for tensor_id, metadata in self.tensor_metadata.items():
            hours_since_access = (current_time - metadata.last_access) / 3600
            if hours_since_access > threshold_hours:
                cold_tensors.append(tensor_id)

        return cold_tensors

    def _calculate_config_similarity(
        self,
        config1: Dict[str, Any],
        config2: Dict[str, Any]
    ) -> float:
        """Calculate similarity between two configurations"""

        # Simple Jaccard similarity for string keys
        keys1 = set(str(k) + ":" + str(v) for k, v in config1.items())
        keys2 = set(str(k) + ":" + str(v) for k, v in config2.items())

        intersection = len(keys1.intersection(keys2))
        union = len(keys1.union(keys2))

        return intersection / union if union > 0 else 0.0

    def _update_lru(self, tensor_id: str):
        """Update LRU order"""
        if tensor_id in self.lru_order:
            self.lru_order.remove(tensor_id)
        self.lru_order.append(tensor_id)

    async def _load_metadata(self):
        """Load metadata from Redis"""
        if not self.redis_client:
            return

        keys = await self.redis_client.keys("tensor_meta:*")
        for key in keys:
            data = await self.redis_client.get(key)
            if data:
                tensor_id = key.decode().split(":", 1)[1]
                metadata_dict = json.loads(data)

                # Convert back to dataclass
                metadata = TensorMetadata(**metadata_dict)
                self.tensor_metadata[tensor_id] = metadata

    async def _save_metadata(self, tensor_id: str, metadata: TensorMetadata):
        """Save metadata to Redis"""
        if self.redis_client:
            await self.redis_client.setex(
                f"tensor_meta:{tensor_id}",
                86400,  # 24 hour TTL
                json.dumps(asdict(metadata), default=str)
            )

    # Storage implementation methods would go here
    # (_store_gpu, _store_redis, _store_mmap, etc.)

    async def get_status(self) -> Dict[str, Any]:
        """Get cache status"""
        return {
            "tensor_count": len(self.tensor_metadata),
            "memory_usage_mb": self.current_memory_usage / (1024 * 1024),
            "gpu_tensors": len(self.gpu_tensors),
            "computation_graphs": len(self.computation_graphs),
            "locations": {
                loc.value: sum(1 for m in self.tensor_metadata.values() if m.location == loc)
                for loc in TensorLocation
            }
        }

    async def cleanup(self):
        """Cleanup resources"""
        # Close mmap files
        for mm in self.mmap_files.values():
            mm.close()

        # Close file handles
        for f in self.file_handles.values():
            f.close()

        # Close Redis connection
        if self.redis_client:
            await self.redis_client.close()

        # Shutdown executor
        self.executor.shutdown(wait=True)