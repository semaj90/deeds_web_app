#!/usr/bin/env python3
"""
Integration Test for Legal AI RAG Pipeline
Tests the complete shard-job lifecycle and ML pipeline integration.
"""

import asyncio
import json
import time
import redis
import pika
from typing import Dict, Any
import logging

# Import our components
from topic_pipeline import LegalTopicPipeline
from qlora_legal_finetune import LegalQLoRAFinetuner

logger = logging.getLogger(__name__)

class RAGPipelineIntegrationTest:
    """Integration test for the complete RAG pipeline"""

    def __init__(self):
        self.redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)
        self.pipeline = LegalTopicPipeline()
        self.finetuner = None

    def test_redis_connectivity(self) -> bool:
        """Test Redis connection"""
        try:
            self.redis_client.ping()
            logger.info("✅ Redis connection successful")
            return True
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            return False

    def test_rabbitmq_connectivity(self) -> bool:
        """Test RabbitMQ connection"""
        try:
            connection = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
            connection.close()
            logger.info("✅ RabbitMQ connection successful")
            return True
        except Exception as e:
            logger.error(f"❌ RabbitMQ connection failed: {e}")
            return False

    def test_ml_pipeline(self) -> bool:
        """Test ML pipeline components"""
        try:
            # Create sample embeddings (normally from GPU workers)
            import numpy as np
            sample_embeddings = np.random.randn(100, 384).astype(np.float32)

            # Test k-means clustering
            kmeans_result = self.pipeline.cluster_embeddings_kmeans(sample_embeddings, n_clusters=5)
            assert 'labels' in kmeans_result
            assert 'centroids' in kmeans_result
            logger.info("✅ k-means clustering test passed")

            # Test SOM clustering
            som_result = self.pipeline.cluster_embeddings_som(sample_embeddings, map_size=(10, 10))
            assert 'coordinates' in som_result
            logger.info("✅ SOM clustering test passed")

            # Test autoencoder compression
            compressed = self.pipeline.compress_embeddings_autoencoder(sample_embeddings, bottleneck_size=64)
            assert compressed.shape[1] < sample_embeddings.shape[1]  # Should be compressed
            logger.info("✅ Autoencoder compression test passed")

            # Test full pipeline
            results = self.pipeline.run_full_pipeline(sample_embeddings, n_clusters=5)
            assert 'kmeans_labels' in results
            assert 'som_coordinates' in results
            assert 'compressed_embeddings' in results
            assert 'topic_labels' in results
            logger.info("✅ Full ML pipeline test passed")

            return True
        except Exception as e:
            logger.error(f"❌ ML pipeline test failed: {e}")
            return False

    def test_qlora_setup(self) -> bool:
        """Test QLoRA fine-tuning setup (without actual training)"""
        try:
            # This would normally load a real model, but we'll just test the class
            self.finetuner = LegalQLoRAFinetuner(
                model_name="google/gemma-2b",  # Small model for testing
                output_dir="./test-qlora-output"
            )

            # Test data preparation
            from qlora_legal_finetune import create_legal_training_data_example
            create_legal_training_data_example("test_training_data.jsonl")

            # Test dataset preparation
            dataset = self.finetuner.prepare_legal_dataset("test_training_data.jsonl")
            assert len(dataset) > 0
            logger.info("✅ QLoRA dataset preparation test passed")

            return True
        except Exception as e:
            logger.error(f"❌ QLoRA setup test failed: {e}")
            return False

    def test_status_tracking(self) -> bool:
        """Test Redis-based status tracking"""
        try:
            test_job_id = "test-job-123"

            # Simulate document processing status
            status_key = f"rag:doc:{test_job_id}:status"
            self.redis_client.set(status_key, json.dumps({
                "status": "processing",
                "totalShards": 10,
                "completedShards": 5,
                "errors": []
            }))

            # Verify status retrieval
            status_data = self.redis_client.get(status_key)
            status = json.loads(status_data)
            assert status["status"] == "processing"
            assert status["completedShards"] == 5

            # Clean up
            self.redis_client.delete(status_key)
            logger.info("✅ Status tracking test passed")

            return True
        except Exception as e:
            logger.error(f"❌ Status tracking test failed: {e}")
            return False

    def simulate_shard_job_lifecycle(self) -> bool:
        """Simulate complete shard job lifecycle"""
        try:
            job_id = "integration-test-job"
            num_shards = 3

            # 1. Initialize job status
            status_key = f"rag:doc:{job_id}:status"
            self.redis_client.set(status_key, json.dumps({
                "status": "sharding",
                "totalShards": num_shards,
                "completedShards": 0,
                "errors": []
            }))

            # 2. Simulate shard processing
            for shard_id in range(num_shards):
                # Simulate Go SIMD worker processing
                time.sleep(0.1)  # Simulate processing time

                # Update shard completion
                shard_key = f"rag:doc:{job_id}:shard:{shard_id}"
                self.redis_client.set(shard_key, json.dumps({
                    "shardId": shard_id,
                    "chunks": [
                        {"text": f"Sample chunk {i}", "embedding": [0.1] * 384}
                        for i in range(10)
                    ],
                    "status": "completed"
                }))

                # Update overall status
                current_status = json.loads(self.redis_client.get(status_key))
                current_status["completedShards"] = shard_id + 1
                if current_status["completedShards"] == num_shards:
                    current_status["status"] = "completed"
                self.redis_client.set(status_key, json.dumps(current_status))

            # 3. Verify final status
            final_status = json.loads(self.redis_client.get(status_key))
            assert final_status["status"] == "completed"
            assert final_status["completedShards"] == num_shards

            # 4. Simulate ML pipeline processing
            all_chunks = []
            for shard_id in range(num_shards):
                shard_data = json.loads(self.redis_client.get(f"rag:doc:{job_id}:shard:{shard_id}"))
                all_chunks.extend(shard_data["chunks"])

            # Extract embeddings
            import numpy as np
            embeddings = np.array([chunk["embedding"] for chunk in all_chunks])

            # Run topic pipeline
            results = self.pipeline.run_full_pipeline(embeddings, n_clusters=3)
            assert len(results["topic_labels"]) == len(all_chunks)

            # Clean up
            self.redis_client.delete(status_key)
            for shard_id in range(num_shards):
                self.redis_client.delete(f"rag:doc:{job_id}:shard:{shard_id}")

            logger.info("✅ Complete shard job lifecycle test passed")
            return True

        except Exception as e:
            logger.error(f"❌ Shard job lifecycle test failed: {e}")
            return False

    async def run_all_tests(self) -> Dict[str, bool]:
        """Run all integration tests"""
        logger.info("🚀 Starting Legal AI RAG Pipeline Integration Tests")

        results = {}

        # Test infrastructure
        results["redis"] = self.test_redis_connectivity()
        results["rabbitmq"] = self.test_rabbitmq_connectivity()

        # Test ML components
        results["ml_pipeline"] = self.test_ml_pipeline()
        results["qlora_setup"] = self.test_qlora_setup()

        # Test data flow
        results["status_tracking"] = self.test_status_tracking()
        results["shard_lifecycle"] = self.simulate_shard_job_lifecycle()

        # Summary
        passed = sum(results.values())
        total = len(results)

        logger.info(f"📊 Test Results: {passed}/{total} tests passed")

        if passed == total:
            logger.info("🎉 All integration tests passed!")
        else:
            failed_tests = [k for k, v in results.items() if not v]
            logger.warning(f"⚠️ Failed tests: {', '.join(failed_tests)}")

        return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    test_runner = RAGPipelineIntegrationTest()

    # Run async tests
    import asyncio
    results = asyncio.run(test_runner.run_all_tests())

    # Exit with appropriate code
    success = all(results.values())
    exit(0 if success else 1)