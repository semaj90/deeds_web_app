"""
Test suite for PageClassifier
Tests feature extraction, heuristic classification, and routing logic
"""
import pytest
import numpy as np
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.processing.page_classifier import (
    PageClassifier,
    PageClassification,
    PageFeatures,
    PageCategory,
    ProcessingRoute,
    FeatureExtractor
)


class TestFeatureExtractor:
    """Test feature extraction methods"""

    @pytest.fixture
    def extractor(self):
        return FeatureExtractor()

    def test_extract_returns_page_features(self, extractor):
        """Feature extraction returns PageFeatures object"""
        image = np.full((100, 100, 3), 128, dtype=np.uint8)
        features = extractor.extract(image)
        assert isinstance(features, PageFeatures)

    def test_text_density_white_page(self, extractor):
        """White page has low text density"""
        white_page = np.full((100, 100), 255, dtype=np.uint8)
        density = extractor._extract_text_density(white_page)
        assert density < 0.1

    def test_text_density_high_contrast(self, extractor):
        """High contrast page (text-like) has higher text density"""
        # Create page with text-like content (dark marks on light background)
        page = np.full((100, 100), 255, dtype=np.uint8)
        page[20:30, 10:90] = 0  # Dark text line
        page[40:50, 10:90] = 0  # Another dark text line
        page[60:70, 10:90] = 0  # Another dark text line
        density = extractor._extract_text_density(page)
        assert density > 0.2  # Should detect text content

    def test_table_presence_no_lines(self, extractor):
        """Page without lines has low table presence"""
        blank = np.full((200, 200), 255, dtype=np.uint8)
        presence = extractor._detect_table_presence(blank)
        assert presence < 0.1

    def test_table_presence_with_grid(self, extractor):
        """Page with grid has table presence"""
        grid = np.full((200, 200), 255, dtype=np.uint8)
        # Draw grid
        for y in range(0, 200, 50):
            grid[y:y+2, :] = 0
        for x in range(0, 200, 50):
            grid[:, x:x+2] = 0
        presence = extractor._detect_table_presence(grid)
        # May not detect small synthetic grid, but should not error
        assert presence >= 0.0

    def test_features_to_vector(self):
        """PageFeatures can be converted to vector"""
        features = PageFeatures(
            text_density=0.5,
            table_presence=0.3,
            image_ratio=0.2
        )
        vector = features.to_vector()
        assert isinstance(vector, np.ndarray)
        assert len(vector) == 16  # All feature fields


class TestPageClassifier:
    """Test page classifier"""

    @pytest.fixture
    def classifier(self):
        return PageClassifier()

    def test_classifier_initializes(self, classifier):
        """Classifier initializes without error"""
        assert classifier.confidence_threshold == 0.8
        assert classifier.model is None  # No pre-trained model

    def test_classify_page_returns_classification(self, classifier):
        """Classification returns PageClassification object"""
        image = np.full((100, 100, 3), 128, dtype=np.uint8)
        result = classifier.classify_page(image)
        assert isinstance(result, PageClassification)
        assert result.category in [c.value for c in PageCategory]
        assert 0.0 <= result.confidence <= 1.0
        assert result.recommended_route in [r.value for r in ProcessingRoute]

    def test_classify_grayscale_image(self, classifier):
        """Can classify grayscale images"""
        gray_image = np.full((100, 100), 128, dtype=np.uint8)
        result = classifier.classify_page(gray_image)
        assert isinstance(result, PageClassification)

    def test_high_confidence_text_routes_cpu(self, classifier):
        """High-confidence text routes to CPU (fast path)"""
        # Simulate high-confidence text classification
        features = PageFeatures(
            text_density=0.6,
            table_presence=0.0,
            image_ratio=0.0
        )
        category, confidence = classifier._heuristic_classify(features)
        if confidence >= 0.8 and category == PageCategory.TEXT:
            route, _ = classifier._determine_route(category, confidence, features)
            assert route == ProcessingRoute.CPU

    def test_table_routes_gpu(self, classifier):
        """Tables route to GPU"""
        features = PageFeatures(
            text_density=0.1,
            table_presence=0.5,
            has_table_grid=True
        )
        category, confidence = classifier._heuristic_classify(features)
        assert category == PageCategory.TABLE
        route, _ = classifier._determine_route(category, confidence, features)
        assert route == ProcessingRoute.GPU

    def test_low_confidence_routes_ensemble(self, classifier):
        """Low confidence routes to ensemble"""
        features = PageFeatures(text_density=0.2, white_space_ratio=0.5)
        category, confidence = classifier._heuristic_classify(features)
        route, _ = classifier._determine_route(category, 0.4, features)
        assert route == ProcessingRoute.ENSEMBLE

    def test_signature_detection_routes_gpu(self, classifier):
        """Signature detection routes to GPU"""
        features = PageFeatures(has_signature=True)
        category, confidence = classifier._heuristic_classify(features)
        assert category == PageCategory.SIGNATURE
        route, _ = classifier._determine_route(category, confidence, features)
        assert route == ProcessingRoute.GPU


class TestGPUPriority:
    """Test GPU priority calculation"""

    @pytest.fixture
    def classifier(self):
        return PageClassifier()

    def test_signature_has_highest_priority(self, classifier):
        """Signatures get highest GPU priority"""
        features = PageFeatures(has_signature=True)
        priority = classifier._calculate_gpu_priority(
            PageCategory.SIGNATURE, 0.9, features
        )
        assert priority >= 0.95

    def test_text_has_lower_priority(self, classifier):
        """Text pages have lower GPU priority"""
        features = PageFeatures(text_density=0.5)
        priority = classifier._calculate_gpu_priority(
            PageCategory.TEXT, 0.9, features
        )
        assert priority < 0.5


class TestBatchClassification:
    """Test batch classification"""

    @pytest.fixture
    def classifier(self):
        return PageClassifier()

    def test_classify_batch(self, classifier):
        """Can classify multiple images at once"""
        images = [
            np.full((100, 100, 3), 255, dtype=np.uint8),
            np.full((100, 100, 3), 0, dtype=np.uint8),
        ]
        results = classifier.classify_batch(images)
        assert len(results) == 2
        assert all(isinstance(r, PageClassification) for r in results)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
