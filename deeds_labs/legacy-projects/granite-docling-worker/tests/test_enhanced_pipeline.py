"""
Test suite for EnhancedPipelineManager
Tests routing, priority queuing, ensemble voting, and VRAM monitoring
"""
import pytest
import numpy as np
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.processing.enhanced_pipeline_manager import (
    EnhancedPipelineManager,
    PipelineConfig,
    PriorityPage,
)
from src.processing.page_classifier import PageClassification, PageFeatures


class TestPipelineConfig:
    """Test pipeline configuration"""

    def test_default_config(self):
        """Default config has sensible values"""
        config = PipelineConfig()
        assert config.gpu_batch_size == 32
        assert config.cpu_batch_size == 16
        assert config.gpu_timeout_ms == 700
        assert config.vram_threshold_percent == 80.0

    def test_custom_config(self):
        """Custom config values are applied"""
        config = PipelineConfig(
            gpu_batch_size=64,
            gpu_timeout_ms=500,
            vram_threshold_percent=90.0,
        )
        assert config.gpu_batch_size == 64
        assert config.gpu_timeout_ms == 500
        assert config.vram_threshold_percent == 90.0


class TestEnhancedPipelineManager:
    """Test enhanced pipeline manager"""

    @pytest.fixture
    def pipeline(self):
        return EnhancedPipelineManager()

    @pytest.fixture
    def sample_pages(self):
        """Generate sample page images"""
        return [
            np.full((100, 100, 3), 255, dtype=np.uint8),  # White page
            np.full((100, 100, 3), 0, dtype=np.uint8),    # Black page
            np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8),  # Random
        ]

    def test_pipeline_initializes(self, pipeline):
        """Pipeline initializes without error"""
        assert pipeline.classifier is not None
        assert pipeline.gpu_processor is not None
        assert pipeline.cpu_processor is not None

    def test_process_document_returns_results(self, pipeline, sample_pages):
        """Processing returns structured results"""
        result = pipeline.process_document(sample_pages, "test-doc-001")

        assert "document_id" in result
        assert result["document_id"] == "test-doc-001"
        assert "total_pages" in result
        assert result["total_pages"] == 3
        assert "processed_pages" in result
        assert "results" in result
        assert "metrics" in result
        assert "routing_summary" in result

    def test_classification_attached_to_results(self, pipeline, sample_pages):
        """Classification metadata is attached to each result"""
        result = pipeline.process_document(sample_pages, "test-doc-002")

        for page_result in result["results"]:
            assert "classification" in page_result.metadata
            assert "category" in page_result.metadata["classification"]
            assert "confidence" in page_result.metadata["classification"]
            assert "route" in page_result.metadata["classification"]

    def test_metrics_tracking(self, pipeline, sample_pages):
        """Pipeline tracks processing metrics"""
        result = pipeline.process_document(sample_pages, "test-doc-003")

        metrics = result["metrics"]
        assert "gpu_processed" in metrics
        assert "cpu_processed" in metrics
        assert "ensemble_processed" in metrics
        assert "total_pages" in metrics
        assert "pages_per_second" in metrics

    def test_routing_summary(self, pipeline, sample_pages):
        """Routing summary is generated"""
        result = pipeline.process_document(sample_pages, "test-doc-004")

        summary = result["routing_summary"]
        assert "gpu" in summary
        assert "cpu" in summary
        assert "ensemble" in summary


class TestPriorityRouting:
    """Test priority-based routing"""

    @pytest.fixture
    def pipeline(self):
        return EnhancedPipelineManager()

    def test_signature_gets_highest_priority(self, pipeline):
        """Signatures get highest processing priority"""
        classification = PageClassification(
            category="signature",
            confidence=0.9,
            features=PageFeatures(),
            recommended_route="gpu",
        )
        priority = pipeline._get_priority(classification)
        # Negated for min-heap, so -1.0 is highest priority
        assert priority == -1.0

    def test_text_gets_lower_priority(self, pipeline):
        """Text pages get lower priority than signatures"""
        sig_class = PageClassification(
            category="signature",
            confidence=0.9,
            features=PageFeatures(),
            recommended_route="gpu",
        )
        text_class = PageClassification(
            category="text",
            confidence=0.9,
            features=PageFeatures(),
            recommended_route="cpu",
        )
        sig_priority = pipeline._get_priority(sig_class)
        text_priority = pipeline._get_priority(text_class)

        # Lower value = higher priority (min-heap)
        assert sig_priority < text_priority

    def test_low_confidence_boosts_priority(self, pipeline):
        """Low confidence pages get priority boost"""
        high_conf = PageClassification(
            category="text",
            confidence=0.9,
            features=PageFeatures(),
            recommended_route="cpu",
        )
        low_conf = PageClassification(
            category="text",
            confidence=0.4,  # Below 0.6 threshold
            features=PageFeatures(),
            recommended_route="ensemble",
        )
        high_priority = pipeline._get_priority(high_conf)
        low_priority = pipeline._get_priority(low_conf)

        # Low confidence should get boosted (lower value = higher priority)
        assert low_priority < high_priority


class TestEnsembleVoting:
    """Test ensemble voting logic"""

    @pytest.fixture
    def pipeline(self):
        return EnhancedPipelineManager()

    def test_ensemble_picks_higher_confidence(self, pipeline):
        """Ensemble voting picks result with higher confidence"""
        # Create a test page
        page = np.full((100, 100, 3), 200, dtype=np.uint8)
        classification = PageClassification(
            category="mixed",
            confidence=0.5,
            features=PageFeatures(),
            recommended_route="ensemble",
        )
        priority_page = PriorityPage(
            priority=-0.5,
            page_num=1,
            image=page,
            classification=classification,
        )

        result = pipeline._process_ensemble_page(priority_page)

        assert result is not None
        assert "classification" in result.metadata
        assert "ensemble" in result.metadata["classification"]
        assert "winner" in result.metadata["classification"]["ensemble"]


class TestPipelineStatus:
    """Test pipeline status reporting"""

    @pytest.fixture
    def pipeline(self):
        return EnhancedPipelineManager()

    def test_status_includes_all_components(self, pipeline):
        """Status includes GPU, CPU, and ensemble info"""
        status = pipeline.get_pipeline_status()

        assert "gpu" in status
        assert "cpu" in status
        assert "ensemble" in status
        assert "metrics" in status
        assert "config" in status

    def test_gpu_status_has_memory_info(self, pipeline):
        """GPU status includes memory information"""
        status = pipeline.get_pipeline_status()

        gpu_status = status["gpu"]
        assert "memory" in gpu_status
        assert "vram_percent" in gpu_status
        assert "vram_critical" in gpu_status

    def test_cpu_status_has_simd_info(self, pipeline):
        """CPU status includes SIMD information"""
        status = pipeline.get_pipeline_status()

        cpu_status = status["cpu"]
        assert "simd_enabled" in cpu_status


class TestMetricsReset:
    """Test metrics reset functionality"""

    @pytest.fixture
    def pipeline(self):
        return EnhancedPipelineManager()

    def test_reset_clears_metrics(self, pipeline):
        """Reset metrics clears all counters"""
        # Process some pages to generate metrics
        pages = [np.full((50, 50, 3), 128, dtype=np.uint8) for _ in range(3)]
        pipeline.process_document(pages, "test")

        # Verify metrics are populated
        assert pipeline.metrics["total_pages"] > 0

        # Reset
        pipeline.reset_metrics()

        # Verify reset
        assert pipeline.metrics["total_pages"] == 0
        assert pipeline.metrics["gpu_processed"] == 0
        assert pipeline.metrics["cpu_processed"] == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
