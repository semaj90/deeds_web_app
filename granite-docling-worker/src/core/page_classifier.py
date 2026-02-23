"""
Page Classification Module
==========================

Micro-ML classifier for page categorization.

Categories:
- text: Text-heavy pages (contracts, legal text)
- table: Table-dominant pages (financial statements, schedules)
- image: Image-heavy pages (diagrams, scanned photos)
- mixed: Mixed content (combination of above)

Target Performance:
- Classification time: <50ms per page
- Accuracy: 95%+ on test set
- Ensemble fallback for low confidence (<0.8)

Usage:
    classifier = PageClassifier()
    category, confidence = classifier.classify_page(image_array)
"""

import cv2
import numpy as np
from typing import Literal, Tuple, Dict
from dataclasses import dataclass
import logging

# Type definitions
PageCategory = Literal["text", "table", "image", "mixed"]

@dataclass
class ClassificationResult:
    """Page classification result with metadata"""
    category: PageCategory
    confidence: float
    features: Dict[str, float]
    processing_time_ms: float

class PageClassifier:
    """
    Lightweight page classifier using OpenCV features.

    No ML model training required - uses rule-based ensemble
    with feature extraction for fast, reliable classification.
    """

    def __init__(self, confidence_threshold: float = 0.8):
        """
        Initialize page classifier.

        Args:
            confidence_threshold: Minimum confidence for primary classification
        """
        self.confidence_threshold = confidence_threshold
        self.logger = logging.getLogger(__name__)

        # Classification thresholds (tuned for legal documents)
        self.thresholds = {
            "text_density_high": 0.6,      # Text-heavy if >60% text
            "table_score_high": 0.5,       # Table if >50% table structure
            "image_ratio_high": 0.4,       # Image if >40% image content
            "line_count_table": 15,        # Min lines for table detection
        }

    def classify_page(self, image: np.ndarray) -> ClassificationResult:
        """
        Classify page type with confidence score.

        Args:
            image: Page image as numpy array (BGR or grayscale)

        Returns:
            ClassificationResult with category, confidence, features
        """
        import time
        start = time.perf_counter()

        # Extract features
        features = self._extract_features(image)

        # Primary classification
        category, confidence = self._classify_from_features(features)

        # Ensemble fallback if confidence low
        if confidence < self.confidence_threshold:
            category, confidence = self._ensemble_classify(features)

        processing_time = (time.perf_counter() - start) * 1000  # Convert to ms

        return ClassificationResult(
            category=category,
            confidence=confidence,
            features=features,
            processing_time_ms=processing_time
        )

    def _extract_features(self, image: np.ndarray) -> Dict[str, float]:
        """
        Extract classification features from page image.

        Returns dict with:
        - text_density: Percentage of text regions (0-1)
        - line_count: Number of horizontal lines detected
        - image_ratio: Percentage of image content (0-1)
        - table_score: Table structure score (0-1)
        """
        # Ensure grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()

        return {
            "text_density": self._calculate_text_density(gray),
            "line_count": self._detect_horizontal_lines(gray),
            "image_ratio": self._calculate_image_ratio(gray),
            "table_score": self._detect_table_structure(gray),
        }

    def _calculate_text_density(self, gray: np.ndarray) -> float:
        """
        Calculate percentage of page covered by text.

        Uses Otsu thresholding to separate text from background.
        """
        # Binary threshold with Otsu
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Count text pixels (black in inverted image)
        text_pixels = np.sum(binary > 0)
        total_pixels = binary.size

        return text_pixels / total_pixels if total_pixels > 0 else 0.0

    def _detect_horizontal_lines(self, gray: np.ndarray) -> int:
        """
        Detect horizontal lines (indicates tables).

        Uses Canny edge detection + Hough line transform.
        """
        # Edge detection
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)

        # Hough line detection (horizontal lines)
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi/180,
            threshold=100,
            minLineLength=100,
            maxLineGap=10
        )

        if lines is None:
            return 0

        # Filter for horizontal lines (angle close to 0 or 180)
        horizontal_lines = 0
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
            if angle < 10 or angle > 170:  # Near horizontal
                horizontal_lines += 1

        return horizontal_lines

    def _detect_vertical_lines(self, gray: np.ndarray) -> int:
        """Detect vertical lines (indicates tables)."""
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, 100, minLineLength=100, maxLineGap=10)

        if lines is None:
            return 0

        # Filter for vertical lines (angle close to 90)
        vertical_lines = 0
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
            if 80 < angle < 100:  # Near vertical
                vertical_lines += 1

        return vertical_lines

    def _calculate_image_ratio(self, gray: np.ndarray) -> float:
        """
        Calculate percentage of page covered by images.

        Uses contour detection to identify image regions.
        """
        # Threshold
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)

        # Find contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Filter large contours (likely images)
        total_area = gray.shape[0] * gray.shape[1]
        image_area = 0

        for contour in contours:
            area = cv2.contourArea(contour)
            # Consider contours >1000 pixels as potential images
            if area > 1000:
                image_area += area

        return image_area / total_area if total_area > 0 else 0.0

    def _detect_table_structure(self, gray: np.ndarray) -> float:
        """
        Score for table-like structure.

        Combines horizontal + vertical line counts.
        Normalized to [0, 1].
        """
        h_lines = self._detect_horizontal_lines(gray)
        v_lines = self._detect_vertical_lines(gray)

        # Table score: normalized sum of line counts
        # Assume 20 lines = perfect table
        table_score = min(1.0, (h_lines + v_lines) / 20)

        return table_score

    def _classify_from_features(self, features: Dict[str, float]) -> Tuple[PageCategory, float]:
        """
        Primary classification from extracted features.

        Returns: (category, confidence)
        """
        # Rule-based classification with confidence scoring

        # Table detection (high priority)
        if features["table_score"] > self.thresholds["table_score_high"]:
            return "table", 0.9

        # Image detection
        if features["image_ratio"] > self.thresholds["image_ratio_high"]:
            return "image", 0.85

        # Text detection
        if features["text_density"] > self.thresholds["text_density_high"]:
            return "text", 0.85

        # Mixed (no dominant feature)
        return "mixed", 0.7

    def _ensemble_classify(self, features: Dict[str, float]) -> Tuple[PageCategory, float]:
        """
        Ensemble fallback with rule-based heuristics.

        Used when primary classification has low confidence.
        """
        # Weighted voting system
        scores = {
            "text": 0.0,
            "table": 0.0,
            "image": 0.0,
            "mixed": 0.0,
        }

        # Text score
        if features["text_density"] > 0.5:
            scores["text"] += 0.4
        if features["text_density"] > 0.7:
            scores["text"] += 0.3

        # Table score
        if features["table_score"] > 0.3:
            scores["table"] += 0.3
        if features["line_count"] > self.thresholds["line_count_table"]:
            scores["table"] += 0.4

        # Image score
        if features["image_ratio"] > 0.2:
            scores["image"] += 0.3
        if features["image_ratio"] > 0.4:
            scores["image"] += 0.4

        # Mixed (fallback)
        if max(scores.values()) < 0.5:
            scores["mixed"] = 0.75

        # Return category with highest score
        best_category = max(scores, key=scores.get)
        confidence = scores[best_category]

        return best_category, confidence  # type: ignore

    def classify_batch(self, images: list[np.ndarray]) -> list[ClassificationResult]:
        """
        Classify multiple pages in batch.

        Args:
            images: List of page images

        Returns:
            List of ClassificationResult
        """
        return [self.classify_page(img) for img in images]


# Example usage
if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) < 2:
        print("Usage: python page_classifier.py <image_path>")
        sys.exit(1)

    # Load test image
    image_path = sys.argv[1]
    image = cv2.imread(image_path)

    if image is None:
        print(f"Error: Could not load image {image_path}")
        sys.exit(1)

    # Classify
    classifier = PageClassifier()
    result = classifier.classify_page(image)

    print(f"\n{'='*60}")
    print(f"Page Classification Result")
    print(f"{'='*60}")
    print(f"Category:         {result.category}")
    print(f"Confidence:       {result.confidence:.2%}")
    print(f"Processing Time:  {result.processing_time_ms:.2f}ms")
    print(f"\nFeatures:")
    for key, value in result.features.items():
        print(f"  {key:20s} {value:.3f}")
    print(f"{'='*60}\n")
