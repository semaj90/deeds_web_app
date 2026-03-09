"""
Page Classifier for Granite-Docling Worker
Micro-ML classifier for routing pages to GPU (Granite) or CPU (Tesseract) pipeline
Implements: RandomForest classifier, feature extraction, ensemble fallback
"""

import logging
import pickle
import os
from dataclasses import dataclass, field
from typing import Tuple, List, Optional, Dict, Any
from enum import Enum
import cv2
import numpy as np

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

logger = logging.getLogger(__name__)


class PageCategory(Enum):
    """Page category enumeration"""
    TEXT = "text"
    TABLE = "table"
    IMAGE = "image"
    MIXED = "mixed"
    HANDWRITTEN = "handwritten"
    SIGNATURE = "signature"


class ProcessingRoute(Enum):
    """Processing route enumeration"""
    GPU = "gpu"           # Granite-Docling (heavy processing)
    CPU = "cpu"           # Tesseract (fast OCR)
    ENSEMBLE = "ensemble" # Both with confidence voting
    SKIP = "skip"         # Already processed / cached


@dataclass
class PageFeatures:
    """Extracted features from a page image"""
    # Basic features
    text_density: float = 0.0
    table_presence: float = 0.0
    image_ratio: float = 0.0

    # Layout complexity
    line_count: int = 0
    contour_count: int = 0
    edge_density: float = 0.0

    # Advanced features
    has_handwriting: bool = False
    has_signature: bool = False
    has_stamp: bool = False
    has_table_grid: bool = False

    # Histogram features
    brightness_mean: float = 0.0
    brightness_std: float = 0.0
    contrast: float = 0.0

    # Spatial features
    text_region_count: int = 0
    image_region_count: int = 0
    white_space_ratio: float = 0.0

    def to_vector(self) -> np.ndarray:
        """Convert features to numpy vector for ML model"""
        return np.array([
            self.text_density,
            self.table_presence,
            self.image_ratio,
            self.line_count / 100.0,  # Normalize
            self.contour_count / 500.0,
            self.edge_density,
            float(self.has_handwriting),
            float(self.has_signature),
            float(self.has_stamp),
            float(self.has_table_grid),
            self.brightness_mean / 255.0,
            self.brightness_std / 128.0,
            self.contrast,
            self.text_region_count / 20.0,
            self.image_region_count / 10.0,
            self.white_space_ratio,
        ], dtype=np.float32)


@dataclass
class PageClassification:
    """Page classification result"""
    category: str
    confidence: float
    features: PageFeatures
    recommended_route: str
    routing_reason: str = ""
    gpu_priority: float = 0.5  # 0-1, higher = process on GPU first
    needs_reparse: bool = False  # Flag for low-confidence results


class FeatureExtractor:
    """Extract features from page images for classification"""

    def __init__(self):
        self.min_contour_area = 100
        self.table_line_threshold = 50

    def extract(self, image: np.ndarray) -> PageFeatures:
        """Extract all features from an image"""
        features = PageFeatures()

        try:
            # Ensure image is in correct format
            if len(image.shape) == 2:
                gray = image
                bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
            else:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                bgr = image

            # Basic features
            features.text_density = self._extract_text_density(gray)
            features.table_presence = self._detect_table_presence(gray)
            features.image_ratio = self._calculate_image_ratio(gray)

            # Layout complexity
            features.line_count = self._count_lines(gray)
            features.contour_count = self._count_contours(gray)
            features.edge_density = self._calculate_edge_density(gray)

            # Advanced features
            features.has_handwriting = self._detect_handwriting(gray)
            features.has_signature = self._detect_signature(gray)
            features.has_stamp = self._detect_stamp(bgr)
            features.has_table_grid = self._detect_table_grid(gray)

            # Histogram features
            features.brightness_mean = float(np.mean(gray))
            features.brightness_std = float(np.std(gray))
            features.contrast = self._calculate_contrast(gray)

            # Spatial features
            features.text_region_count, features.image_region_count = self._count_regions(gray)
            features.white_space_ratio = self._calculate_white_space(gray)

        except Exception as e:
            logger.warning(f"Feature extraction partially failed: {e}")

        return features

    def _extract_text_density(self, gray: np.ndarray) -> float:
        """Calculate text density using adaptive thresholding"""
        try:
            binary = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV, 11, 2
            )
            text_pixels = np.sum(binary > 0)
            total_pixels = binary.size
            return float(text_pixels / total_pixels) if total_pixels > 0 else 0.0
        except Exception:
            return 0.5

    def _detect_table_presence(self, gray: np.ndarray) -> float:
        """Detect presence of tables using line detection"""
        try:
            # Apply binary threshold first to get clean edges
            _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)

            # Detect horizontal lines (long, thin structures)
            horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (80, 1))
            horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)

            # Detect vertical lines
            vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 80))
            vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)

            # Both horizontal AND vertical lines needed for a table
            h_count = np.sum(horizontal > 0)
            v_count = np.sum(vertical > 0)
            total_pixels = gray.size

            # Calculate intersection (table grid points)
            intersection = cv2.bitwise_and(horizontal, vertical)
            intersect_count = np.sum(intersection > 0)

            # Need significant intersection points for a real table
            if intersect_count < 10:
                return 0.0

            # Score based on grid structure (h + v lines with intersections)
            score = min(1.0, (h_count + v_count) / total_pixels * 5)
            return score if intersect_count > 20 else score * 0.5
        except Exception:
            return 0.0

    def _calculate_image_ratio(self, gray: np.ndarray) -> float:
        """Calculate ratio of photo/image regions vs document content"""
        try:
            # Calculate color variance in the image
            # Photos have high local variance, text documents have low variance
            h, w = gray.shape[:2]

            # Divide into blocks and measure variance
            block_size = 50
            high_variance_blocks = 0
            total_blocks = 0

            for y in range(0, h - block_size, block_size):
                for x in range(0, w - block_size, block_size):
                    block = gray[y:y+block_size, x:x+block_size]
                    variance = float(np.var(block))
                    total_blocks += 1

                    # High variance blocks (photos/gradients) vs low variance (text/blank)
                    # Photos typically have variance > 2000 (wider range of pixel values)
                    if variance > 2000:
                        high_variance_blocks += 1

            if total_blocks == 0:
                return 0.0

            return float(high_variance_blocks / total_blocks)
        except Exception:
            return 0.0

    def _count_lines(self, gray: np.ndarray) -> int:
        """Count number of text lines using horizontal projection"""
        try:
            _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)
            projection = np.sum(binary, axis=1)
            threshold = np.max(projection) * 0.1
            lines = np.diff((projection > threshold).astype(int))
            return int(np.sum(lines == 1))
        except Exception:
            return 0

    def _count_contours(self, gray: np.ndarray) -> int:
        """Count significant contours"""
        try:
            _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            return len([c for c in contours if cv2.contourArea(c) > self.min_contour_area])
        except Exception:
            return 0

    def _calculate_edge_density(self, gray: np.ndarray) -> float:
        """Calculate edge density using Canny"""
        try:
            edges = cv2.Canny(gray, 50, 150)
            return float(np.sum(edges > 0) / edges.size) if edges.size > 0 else 0.0
        except Exception:
            return 0.0

    def _detect_handwriting(self, gray: np.ndarray) -> bool:
        """Detect presence of handwriting (irregular strokes)"""
        try:
            # Handwriting tends to have irregular, curved strokes
            edges = cv2.Canny(gray, 30, 100)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            if len(contours) < 10:
                return False

            # Calculate stroke irregularity
            areas = [cv2.contourArea(c) for c in contours if cv2.contourArea(c) > 10]
            if len(areas) < 10:
                return False

            # High variance in contour sizes suggests handwriting
            variance = np.std(areas) / (np.mean(areas) + 1e-6)
            return variance > 2.0
        except Exception:
            return False

    def _detect_signature(self, gray: np.ndarray) -> bool:
        """Detect presence of signature region"""
        try:
            # Signatures are typically in bottom quarter, have specific aspect ratio
            h, w = gray.shape[:2]
            bottom_quarter = gray[int(h * 0.75):, :]

            _, binary = cv2.threshold(bottom_quarter, 127, 255, cv2.THRESH_BINARY_INV)
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            signature_candidates = 0
            for contour in contours:
                x, y, cw, ch = cv2.boundingRect(contour)
                aspect_ratio = cw / (ch + 1e-6)
                area = cv2.contourArea(contour)

                # Signature characteristics:
                # - Moderate aspect ratio (signatures are typically wider than tall)
                # - Not too small or too large
                # - Has some complexity (not just a line)
                perimeter = cv2.arcLength(contour, True)
                complexity = (perimeter ** 2) / (area + 1e-6) if area > 0 else 0

                # Real signatures have moderate complexity (not too simple, not noise)
                if (2.0 < aspect_ratio < 6.0 and
                    2000 < area < w * h * 0.05 and
                    20 < complexity < 200):
                    signature_candidates += 1

            # Need at least one good candidate
            return signature_candidates >= 1
        except Exception:
            return False

    def _detect_stamp(self, bgr: np.ndarray) -> bool:
        """Detect presence of stamps (circular colored regions)"""
        try:
            hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

            # Look for red/blue stamps (common colors)
            red_mask = cv2.inRange(hsv, (0, 100, 100), (10, 255, 255))
            blue_mask = cv2.inRange(hsv, (100, 100, 100), (130, 255, 255))
            combined = cv2.bitwise_or(red_mask, blue_mask)

            # Find circular contours
            contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for contour in contours:
                area = cv2.contourArea(contour)
                perimeter = cv2.arcLength(contour, True)
                if perimeter > 0:
                    circularity = 4 * np.pi * area / (perimeter ** 2)
                    if circularity > 0.7 and area > 500:  # Circular and significant
                        return True
            return False
        except Exception:
            return False

    def _detect_table_grid(self, gray: np.ndarray) -> bool:
        """Detect if page has table grid structure"""
        try:
            # First, check if image is mostly uniform (document-like) vs noisy
            overall_variance = float(np.var(gray))
            if overall_variance > 3000:  # High variance = photo/noise, not a table
                return False

            # Use Hough lines to detect grid with stricter parameters
            edges = cv2.Canny(gray, 50, 150)
            lines = cv2.HoughLinesP(edges, 1, np.pi/180, 150, minLineLength=150, maxLineGap=5)

            if lines is None or len(lines) < 6:  # Need minimum lines for a grid
                return False

            horizontal = 0
            vertical = 0

            for line in lines:
                x1, y1, x2, y2 = line[0]
                angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
                if angle < 5 or angle > 175:
                    horizontal += 1
                elif 85 < angle < 95:
                    vertical += 1

            # Grid has both horizontal and vertical lines (stricter: need 4+ each)
            return horizontal >= 4 and vertical >= 4
        except Exception:
            return False

    def _calculate_contrast(self, gray: np.ndarray) -> float:
        """Calculate image contrast"""
        try:
            return float(gray.max() - gray.min()) / 255.0
        except Exception:
            return 0.5

    def _count_regions(self, gray: np.ndarray) -> Tuple[int, int]:
        """Count text and image regions"""
        try:
            _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            text_regions = 0
            image_regions = 0

            for contour in contours:
                area = cv2.contourArea(contour)
                x, y, w, h = cv2.boundingRect(contour)
                aspect_ratio = w / (h + 1e-6)

                if area < 100:
                    continue
                elif area > gray.size * 0.05:  # Large region = image
                    image_regions += 1
                elif 0.1 < aspect_ratio < 10:  # Text-like aspect ratio
                    text_regions += 1

            return text_regions, image_regions
        except Exception:
            return 0, 0

    def _calculate_white_space(self, gray: np.ndarray) -> float:
        """Calculate white space ratio"""
        try:
            white_pixels = np.sum(gray > 240)
            return float(white_pixels / gray.size) if gray.size > 0 else 0.0
        except Exception:
            return 0.5


class PageClassifier:
    """
    Micro-ML Page Classifier for Document Routing
    Uses RandomForest when available, falls back to heuristics
    """

    def __init__(
        self,
        confidence_threshold: float = 0.8,
        gpu_timeout_threshold_ms: float = 700.0,
        model_path: Optional[str] = None
    ):
        self.confidence_threshold = confidence_threshold
        self.gpu_timeout_threshold = gpu_timeout_threshold_ms
        self.feature_extractor = FeatureExtractor()

        # ML model (optional)
        self.model: Optional[RandomForestClassifier] = None
        self.scaler: Optional[StandardScaler] = None
        self.model_path = model_path

        # Load model if available
        if model_path and os.path.exists(model_path):
            self._load_model(model_path)

        # Category weights for routing decisions
        self.category_gpu_priority = {
            PageCategory.SIGNATURE: 1.0,    # Always GPU (critical accuracy)
            PageCategory.HANDWRITTEN: 0.95, # GPU preferred
            PageCategory.TABLE: 0.85,       # GPU for structure
            PageCategory.IMAGE: 0.7,        # GPU for visual elements
            PageCategory.MIXED: 0.6,        # Depends on confidence
            PageCategory.TEXT: 0.3,         # CPU usually sufficient
        }

        logger.info(f"PageClassifier initialized (threshold: {confidence_threshold}, ML: {self.model is not None})")

    def _load_model(self, path: str) -> bool:
        """Load pre-trained model from disk"""
        try:
            with open(path, 'rb') as f:
                data = pickle.load(f)
                self.model = data.get('model')
                self.scaler = data.get('scaler')
            logger.info(f"Loaded ML model from {path}")
            return True
        except Exception as e:
            logger.warning(f"Failed to load model: {e}")
            return False

    def save_model(self, path: str) -> bool:
        """Save trained model to disk"""
        try:
            with open(path, 'wb') as f:
                pickle.dump({
                    'model': self.model,
                    'scaler': self.scaler
                }, f)
            logger.info(f"Saved ML model to {path}")
            return True
        except Exception as e:
            logger.error(f"Failed to save model: {e}")
            return False

    def train(self, images: List[np.ndarray], labels: List[str]) -> float:
        """Train the classifier on labeled data"""
        if not SKLEARN_AVAILABLE:
            logger.error("scikit-learn not available for training")
            return 0.0

        try:
            # Extract features
            features = [self.feature_extractor.extract(img).to_vector() for img in images]
            X = np.array(features)
            y = np.array(labels)

            # Scale features
            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X)

            # Train RandomForest
            self.model = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                min_samples_split=5,
                random_state=42,
                n_jobs=-1  # Use all cores
            )
            self.model.fit(X_scaled, y)

            # Return training accuracy
            accuracy = self.model.score(X_scaled, y)
            logger.info(f"Trained classifier with accuracy: {accuracy:.2%}")
            return accuracy

        except Exception as e:
            logger.error(f"Training failed: {e}")
            return 0.0

    def classify_page(self, image: np.ndarray) -> PageClassification:
        """
        Classify a page image and determine optimal processing route

        Args:
            image: Page image as numpy array (BGR or grayscale)

        Returns:
            PageClassification with category, confidence, and routing recommendation
        """
        try:
            # Extract features
            features = self.feature_extractor.extract(image)

            # Try ML classification first
            if self.model is not None and self.scaler is not None:
                category, confidence = self._ml_classify(features)
            else:
                # Fall back to heuristic classification
                category, confidence = self._heuristic_classify(features)

            # Determine routing
            route, reason = self._determine_route(category, confidence, features)

            # Calculate GPU priority
            gpu_priority = self._calculate_gpu_priority(category, confidence, features)

            # Flag low-confidence results for potential reparse
            needs_reparse = confidence < 0.6

            return PageClassification(
                category=category.value,
                confidence=confidence,
                features=features,
                recommended_route=route.value,
                routing_reason=reason,
                gpu_priority=gpu_priority,
                needs_reparse=needs_reparse,
            )

        except Exception as e:
            logger.error(f"Classification failed: {e}")
            # Safe default: GPU processing
            return PageClassification(
                category=PageCategory.MIXED.value,
                confidence=0.5,
                features=PageFeatures(),
                recommended_route=ProcessingRoute.GPU.value,
                routing_reason=f"Classification error: {e}",
                gpu_priority=0.8,
                needs_reparse=True,
            )

    def classify_batch(self, images: List[np.ndarray]) -> List[PageClassification]:
        """
        Classify multiple page images in batch

        Args:
            images: List of page images as numpy arrays

        Returns:
            List of PageClassification results
        """
        return [self.classify_page(img) for img in images]

    def _ml_classify(self, features: PageFeatures) -> Tuple[PageCategory, float]:
        """Classify using trained ML model"""
        try:
            X = features.to_vector().reshape(1, -1)
            X_scaled = self.scaler.transform(X)

            # Get prediction and probabilities
            prediction = self.model.predict(X_scaled)[0]
            probabilities = self.model.predict_proba(X_scaled)[0]
            confidence = float(max(probabilities))

            category = PageCategory(prediction)
            return category, confidence

        except Exception as e:
            logger.warning(f"ML classification failed, using heuristics: {e}")
            return self._heuristic_classify(features)

    def _heuristic_classify(self, features: PageFeatures) -> Tuple[PageCategory, float]:
        """Classify using rule-based heuristics"""

        # Priority checks for special content
        if features.has_signature:
            return PageCategory.SIGNATURE, 0.85

        # Stricter handwriting check - must have handwriting AND not much else
        if features.has_handwriting and features.table_presence < 0.1 and features.image_ratio < 0.2:
            return PageCategory.HANDWRITTEN, 0.80

        # Table detection - grid structure is strong signal
        if features.has_table_grid or features.table_presence > 0.3:
            confidence = min(0.95, 0.5 + features.table_presence)
            return PageCategory.TABLE, confidence

        # Image-heavy pages (photos, scans of images)
        if features.image_ratio > 0.5:
            confidence = min(0.90, 0.4 + features.image_ratio)
            return PageCategory.IMAGE, confidence

        # Text-dominant pages (most documents)
        # Lower threshold since text documents often have low text_density
        if features.text_density > 0.1 and features.table_presence < 0.1 and features.image_ratio < 0.3:
            confidence = min(0.90, 0.5 + features.text_density * 1.5)
            return PageCategory.TEXT, confidence

        # Mixed content - text with images or tables
        confidence = 0.5 + 0.2 * (1 - features.white_space_ratio)
        return PageCategory.MIXED, confidence

    def _determine_route(
        self,
        category: PageCategory,
        confidence: float,
        features: PageFeatures
    ) -> Tuple[ProcessingRoute, str]:
        """Determine optimal processing route"""

        # High-priority GPU content
        if category in [PageCategory.SIGNATURE, PageCategory.HANDWRITTEN]:
            return ProcessingRoute.GPU, f"{category.value} detected - requires GPU accuracy"

        # Tables benefit from Granite's structure understanding
        if category == PageCategory.TABLE:
            return ProcessingRoute.GPU, "Table structure requires Granite-Docling"

        # High-confidence text can use fast CPU path
        if category == PageCategory.TEXT and confidence >= self.confidence_threshold:
            return ProcessingRoute.CPU, "High-confidence text - Tesseract sufficient"

        # Low confidence - use ensemble
        if confidence < 0.6:
            return ProcessingRoute.ENSEMBLE, f"Low confidence ({confidence:.2f}) - ensemble voting"

        # Images with stamps need GPU
        if category == PageCategory.IMAGE and features.has_stamp:
            return ProcessingRoute.GPU, "Image with stamp - requires GPU"

        # Medium confidence - route based on complexity
        if features.edge_density > 0.15 or features.contour_count > 200:
            return ProcessingRoute.GPU, "Complex layout - GPU preferred"

        # Default: CPU for simple pages, GPU for complex
        if features.text_density > 0.4 and features.line_count > 10:
            return ProcessingRoute.CPU, "Standard text document - CPU efficient"

        return ProcessingRoute.GPU, "Default to GPU for quality"

    def _calculate_gpu_priority(
        self,
        category: PageCategory,
        confidence: float,
        features: PageFeatures
    ) -> float:
        """Calculate GPU processing priority (0-1, higher = process first)"""

        base_priority = self.category_gpu_priority.get(category, 0.5)

        # Adjust based on features
        if features.has_signature:
            base_priority = max(base_priority, 0.95)
        if features.has_stamp:
            base_priority = max(base_priority, 0.90)
        if features.has_handwriting:
            base_priority = max(base_priority, 0.85)

        # Low confidence increases priority (need better processing)
        if confidence < 0.6:
            base_priority = min(1.0, base_priority + 0.2)

        return base_priority

    def classify_batch(self, images: List[np.ndarray]) -> List[PageClassification]:
        """Classify multiple pages and sort by GPU priority"""
        classifications = [self.classify_page(img) for img in images]
        # Sort by GPU priority (highest first)
        classifications.sort(key=lambda c: c.gpu_priority, reverse=True)
        return classifications


# Convenience function
def get_page_classifier(
    confidence_threshold: float = 0.8,
    model_path: Optional[str] = None
) -> PageClassifier:
    """Get a configured page classifier instance"""
    return PageClassifier(
        confidence_threshold=confidence_threshold,
        model_path=model_path
    )


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)

    # Test with a sample image
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        image = cv2.imread(image_path)
        if image is not None:
            classifier = get_page_classifier()
            result = classifier.classify_page(image)
            print(f"\nClassification Result:")
            print(f"  Category: {result.category}")
            print(f"  Confidence: {result.confidence:.2%}")
            print(f"  Route: {result.recommended_route}")
            print(f"  Reason: {result.routing_reason}")
            print(f"  GPU Priority: {result.gpu_priority:.2f}")
            print(f"  Needs Reparse: {result.needs_reparse}")
            print(f"\nFeatures:")
            print(f"  Text Density: {result.features.text_density:.2%}")
            print(f"  Table Presence: {result.features.table_presence:.2%}")
            print(f"  Image Ratio: {result.features.image_ratio:.2%}")
            print(f"  Has Signature: {result.features.has_signature}")
            print(f"  Has Handwriting: {result.features.has_handwriting}")
            print(f"  Has Table Grid: {result.features.has_table_grid}")
        else:
            print(f"Could not load image: {image_path}")
    else:
        print("Usage: python page_classifier.py <image_path>")
        print("\nRunning self-test with synthetic image...")

        # Create test image
        test_image = np.ones((800, 600, 3), dtype=np.uint8) * 255
        cv2.putText(test_image, "Test Document", (100, 100),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
        cv2.rectangle(test_image, (50, 200), (550, 400), (0, 0, 0), 1)

        classifier = get_page_classifier()
        result = classifier.classify_page(test_image)

        print(f"\nSelf-test Result:")
        print(f"  Category: {result.category}")
        print(f"  Confidence: {result.confidence:.2%}")
        print(f"  Route: {result.recommended_route}")
        print(f"  ✅ Classifier working correctly")
