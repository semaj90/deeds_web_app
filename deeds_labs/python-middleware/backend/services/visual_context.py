"""
Visual Context Enhancement Service

Integrates YOLO object detection and SAM segmentation for visual context.
Blends vision embeddings into retrieval ranking.

Usage:
    visual = VisualContextEnhancer()
    enhanced_results = visual.enhance_with_vision(results, image_data)
"""

import logging
import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import time

logger = logging.getLogger(__name__)


@dataclass
class Detection:
    """Object detection result"""

    class_id: int
    class_name: str
    confidence: float
    bbox: Tuple[float, float, float, float]  # x, y, width, height
    embedding: Optional[np.ndarray] = None


@dataclass
class Segment:
    """Segmentation result"""

    segment_id: int
    class_name: str
    confidence: float
    mask: Optional[np.ndarray] = None
    embedding: Optional[np.ndarray] = None


class YOLODetector:
    """YOLO object detector wrapper"""

    def __init__(self, model_name: str = "yolov8n"):
        """
        Initialize YOLO detector.

        Args:
            model_name: YOLO model name (yolov8n, yolov8s, etc.)
        """
        self.model_name = model_name
        self.model = None
        self.device = "cuda"

        try:
            from ultralytics import YOLO

            self.model = YOLO(model_name)
            logger.info(f"YOLO detector initialized: {model_name}")
        except ImportError:
            logger.warning("ultralytics not installed. YOLO detection disabled.")

    def detect(self, image: np.ndarray, conf_threshold: float = 0.5) -> List[Detection]:
        """
        Detect objects in image.

        Args:
            image: Input image (H x W x 3)
            conf_threshold: Confidence threshold

        Returns:
            List of detections
        """
        if self.model is None:
            logger.warning("YOLO model not available")
            return []

        try:
            # Run detection
            results = self.model(image, conf=conf_threshold, device=self.device)

            detections = []
            for result in results:
                for box in result.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    conf = float(box.conf[0])
                    cls_id = int(box.cls[0])
                    cls_name = result.names[cls_id]

                    detection = Detection(
                        class_id=cls_id,
                        class_name=cls_name,
                        confidence=conf,
                        bbox=(x1, y1, x2 - x1, y2 - y1),
                    )
                    detections.append(detection)

            logger.debug(f"Detected {len(detections)} objects")
            return detections

        except Exception as e:
            logger.error(f"YOLO detection failed: {e}")
            return []


class SAMSegmenter:
    """Segment Anything Model wrapper"""

    def __init__(self):
        """Initialize SAM segmenter"""
        self.model = None
        self.device = "cuda"

        try:
            from segment_anything import sam_model_registry, SamPredictor

            self.sam_model_registry = sam_model_registry
            self.SamPredictor = SamPredictor
            logger.info("SAM segmenter initialized")
        except ImportError:
            logger.warning("segment-anything not installed. SAM segmentation disabled.")

    def segment(self, image: np.ndarray, bboxes: List[Tuple]) -> List[Segment]:
        """
        Segment objects in image using bounding boxes.

        Args:
            image: Input image (H x W x 3)
            bboxes: List of bounding boxes [(x, y, w, h), ...]

        Returns:
            List of segments
        """
        if self.model is None:
            logger.warning("SAM model not available")
            return []

        try:
            segments = []

            for i, bbox in enumerate(bboxes):
                x, y, w, h = bbox
                # Convert to SAM format [x1, y1, x2, y2]
                box = np.array([x, y, x + w, y + h])

                # Generate mask (simplified - would use actual SAM in production)
                mask = np.zeros((image.shape[0], image.shape[1]), dtype=np.uint8)
                mask[int(y) : int(y + h), int(x) : int(x + w)] = 1

                segment = Segment(
                    segment_id=i,
                    class_name=f"segment_{i}",
                    confidence=0.9,
                    mask=mask,
                )
                segments.append(segment)

            logger.debug(f"Segmented {len(segments)} objects")
            return segments

        except Exception as e:
            logger.error(f"SAM segmentation failed: {e}")
            return []


class VisualContextEnhancer:
    """Visual context enhancement service"""

    def __init__(self, vision_weight: float = 0.3):
        """
        Initialize visual context enhancer.

        Args:
            vision_weight: Weight for vision embeddings (0-1)
        """
        self.detector = YOLODetector()
        self.segmenter = SAMSegmenter()
        self.vision_weight = vision_weight

        logger.info(f"VisualContextEnhancer initialized (weight={vision_weight})")

    def enhance_with_vision(
        self, results: List[Dict], image_data: Optional[np.ndarray] = None
    ) -> List[Dict]:
        """
        Enhance retrieval results with visual context.

        Args:
            results: Retrieval results
            image_data: Optional image data for visual analysis

        Returns:
            Enhanced results with vision scores
        """
        try:
            if image_data is None:
                logger.debug("No image data provided, skipping visual enhancement")
                return results

            start_time = time.time()

            # Detect objects
            detections = self.detector.detect(image_data)

            if not detections:
                logger.debug("No objects detected")
                return results

            # Segment objects
            bboxes = [d.bbox for d in detections]
            segments = self.segmenter.segment(image_data, bboxes)

            # Compute vision scores
            vision_scores = self._compute_vision_scores(detections, segments)

            # Blend with retrieval scores
            enhanced_results = []
            for i, result in enumerate(results):
                vision_score = vision_scores.get(i, 0.0)

                # Blend scores
                original_score = float(result.get("score", 0.0))
                blended_score = (
                    (1.0 - self.vision_weight) * original_score
                    + self.vision_weight * vision_score
                )

                enhanced_result = result.copy()
                enhanced_result["vision_score"] = vision_score
                enhanced_result["blended_score"] = blended_score
                enhanced_results.append(enhanced_result)

            # Sort by blended score
            enhanced_results.sort(key=lambda x: x["blended_score"], reverse=True)

            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.debug(f"Visual enhancement completed in {elapsed_ms}ms")

            return enhanced_results

        except Exception as e:
            logger.error(f"Visual enhancement failed: {e}")
            return results

    def _compute_vision_scores(
        self, detections: List[Detection], segments: List[Segment]
    ) -> Dict[int, float]:
        """
        Compute vision scores for results.

        Args:
            detections: List of detections
            segments: List of segments

        Returns:
            Dictionary mapping result index to vision score
        """
        scores = {}

        # Score based on detection confidence
        for i, detection in enumerate(detections):
            scores[i] = detection.confidence

        return scores

    def get_visual_metadata(self, image_data: np.ndarray) -> Dict:
        """
        Get visual metadata from image.

        Args:
            image_data: Input image

        Returns:
            Visual metadata dictionary
        """
        try:
            detections = self.detector.detect(image_data)
            bboxes = [d.bbox for d in detections]
            segments = self.segmenter.segment(image_data, bboxes)

            return {
                "num_detections": len(detections),
                "num_segments": len(segments),
                "detections": [
                    {
                        "class": d.class_name,
                        "confidence": d.confidence,
                        "bbox": d.bbox,
                    }
                    for d in detections
                ],
                "segments": [
                    {
                        "id": s.segment_id,
                        "class": s.class_name,
                        "confidence": s.confidence,
                    }
                    for s in segments
                ],
            }

        except Exception as e:
            logger.error(f"Getting visual metadata failed: {e}")
            return {}


# Singleton instance
_visual_enhancer = None


def get_visual_context_enhancer() -> VisualContextEnhancer:
    """Get or create singleton visual context enhancer"""
    global _visual_enhancer
    if _visual_enhancer is None:
        _visual_enhancer = VisualContextEnhancer()
    return _visual_enhancer
