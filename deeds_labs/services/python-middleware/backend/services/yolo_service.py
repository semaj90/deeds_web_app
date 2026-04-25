"""
YOLOv8 Object Detection Service
Wraps ultralytics YOLO for evidence image/video analysis
GPU-accelerated with RTX 3060 Ti (8GB VRAM)
"""

import asyncio
from pathlib import Path
from typing import List, Optional, Tuple
import numpy as np
from ultralytics import YOLO
import torch
from PIL import Image
import io

class BoundingBox:
    """Detected object bounding box"""
    def __init__(self, x1: float, y1: float, x2: float, y2: float,
                 confidence: float, class_name: str, class_id: int):
        self.x1 = x1
        self.y1 = y1
        self.x2 = x2
        self.y2 = y2
        self.confidence = confidence
        self.class_name = class_name
        self.class_id = class_id

    def to_dict(self):
        return {
            "bbox": [self.x1, self.y1, self.x2, self.y2],
            "confidence": float(self.confidence),
            "class_name": self.class_name,
            "class_id": self.class_id,
            "center": [(self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2],
            "area": (self.x2 - self.x1) * (self.y2 - self.y1)
        }

class YOLOService:
    """
    YOLOv8 detection service with GPU acceleration
    Model: yolov8n.pt (6.2M params, ~1.2GB VRAM)

    Usage:
        service = YOLOService()
        await service.initialize()
        detections = await service.detect(image_bytes, confidence_threshold=0.5)
    """

    def __init__(self, model_name: str = "yolov8n.pt", device: Optional[str] = None):
        """
        Args:
            model_name: YOLOv8 model variant (n/s/m/l/x)
            device: 'cuda', 'cpu', or None (auto-detect)
        """
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model: Optional[YOLO] = None
        self._lock = asyncio.Lock()

    async def initialize(self) -> None:
        """Load YOLO model onto GPU/CPU"""
        if self.model is not None:
            return

        async with self._lock:
            if self.model is not None:
                return

            # Run blocking model load in executor
            loop = asyncio.get_event_loop()
            self.model = await loop.run_in_executor(
                None,
                lambda: YOLO(self.model_name).to(self.device)
            )

            # Warmup inference (primes CUDA kernels)
            dummy = Image.new('RGB', (640, 640), color='black')
            await loop.run_in_executor(None, self.model, dummy, verbose=False)

    async def detect(
        self,
        image_bytes: bytes,
        confidence_threshold: float = 0.5,
        iou_threshold: float = 0.45,
        max_detections: int = 300
    ) -> List[BoundingBox]:
        """
        Detect objects in image

        Args:
            image_bytes: Raw image data (JPEG/PNG)
            confidence_threshold: Min confidence score (0.0-1.0)
            iou_threshold: NMS IoU threshold
            max_detections: Max objects to return

        Returns:
            List of BoundingBox objects sorted by confidence
        """
        if self.model is None:
            await self.initialize()

        # Decode image
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')

        # Run inference in executor (blocking CUDA ops)
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None,
            lambda: self.model(
                image,
                conf=confidence_threshold,
                iou=iou_threshold,
                max_det=max_detections,
                verbose=False
            )
        )

        # Parse results
        detections = []
        for result in results:
            boxes = result.boxes
            for i in range(len(boxes)):
                x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
                conf = float(boxes.conf[i].cpu().numpy())
                cls_id = int(boxes.cls[i].cpu().numpy())
                cls_name = result.names[cls_id]

                detections.append(BoundingBox(
                    x1=float(x1), y1=float(y1),
                    x2=float(x2), y2=float(y2),
                    confidence=conf,
                    class_name=cls_name,
                    class_id=cls_id
                ))

        # Sort by confidence descending
        detections.sort(key=lambda d: d.confidence, reverse=True)
        return detections

    async def detect_video_frames(
        self,
        video_path: Path,
        sample_fps: float = 1.0,
        **detect_kwargs
    ) -> List[Tuple[float, List[BoundingBox]]]:
        """
        Extract keyframes and run detection

        Args:
            video_path: Path to video file
            sample_fps: Sample rate (frames per second)
            **detect_kwargs: Passed to detect()

        Returns:
            List of (timestamp, detections) tuples
        """
        if self.model is None:
            await self.initialize()

        import cv2

        cap = cv2.VideoCapture(str(video_path))
        video_fps = cap.get(cv2.CAP_PROP_FPS)
        frame_interval = int(video_fps / sample_fps)

        results = []
        frame_idx = 0

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % frame_interval == 0:
                    # Convert BGR to RGB
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    image = Image.fromarray(frame_rgb)

                    # Encode to bytes
                    buffer = io.BytesIO()
                    image.save(buffer, format='JPEG', quality=85)
                    image_bytes = buffer.getvalue()

                    # Detect
                    detections = await self.detect(image_bytes, **detect_kwargs)
                    timestamp = frame_idx / video_fps
                    results.append((timestamp, detections))

                frame_idx += 1
        finally:
            cap.release()

        return results

    def get_stats(self) -> dict:
        """Return service statistics"""
        return {
            "model": self.model_name,
            "device": self.device,
            "initialized": self.model is not None,
            "cuda_available": torch.cuda.is_available(),
            "cuda_device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
            "vram_allocated_mb": torch.cuda.memory_allocated() / (1024**2) if torch.cuda.is_available() else 0,
        }


# Singleton instance
_yolo_service: Optional[YOLOService] = None

def get_yolo_service() -> YOLOService:
    """Get singleton YOLOService instance"""
    global _yolo_service
    if _yolo_service is None:
        _yolo_service = YOLOService()
    return _yolo_service
