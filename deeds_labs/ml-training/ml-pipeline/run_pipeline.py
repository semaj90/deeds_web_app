#!/usr/bin/env python3
"""
Phase 46: Complete ML Pipeline Orchestrator
Runs the full pipeline: AST → Embeddings → Clustering → Dataset → Training
"""

import os
import sys
import json
import subprocess
import argparse
import logging
from pathlib import Path
from typing import Dict, Any, List
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PipelineOrchestrator:
    """Orchestrates the complete ML pipeline"""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)
        self.pipeline_dir = self.workspace_root / "ml-pipeline"
        # Ensure pipeline directory exists
        self.pipeline_dir.mkdir(exist_ok=True)
        self.output_dir = self.pipeline_dir / "outputs"
        self.output_dir.mkdir(exist_ok=True)

    def run_command(self, command: List[str], cwd: Path = None, env: Dict[str, str] = None) -> bool:
        """Run a command and return success status"""
        try:
            logger.info(f"Running: {' '.join(command)}")
            result = subprocess.run(
                command,
                cwd=cwd or self.pipeline_dir,
                env=env,
                capture_output=True,
                text=True,
                timeout=3600  # 1 hour timeout
            )

            if result.returncode == 0:
                logger.info("Command completed successfully")
                return True
            else:
                logger.error(f"Command failed with return code {result.returncode}")
                logger.error(f"STDOUT: {result.stdout}")
                logger.error(f"STDERR: {result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            logger.error("Command timed out")
            return False
        except Exception as e:
            logger.error(f"Command execution failed: {e}")
            return False

    def check_dependencies(self) -> bool:
        """Check if all required dependencies are available"""
        logger.info("Checking dependencies...")

        # Check Python packages
        required_packages = [
            'qdrant_client',
            'sentence_transformers',
            'sklearn',  # scikit-learn imports as sklearn
            'numpy',
            'pandas',
            'beautifulsoup4',
            'selenium',
            'requests',
            'jinja2'
        ]

        for package in required_packages:
            try:
                __import__(package.replace('-', '_'))
            except ImportError:
                logger.error(f"Missing required package: {package}")
                return False

        # Check Qdrant
        try:
            import qdrant_client
            client = qdrant_client.QdrantClient("localhost", port=6333)
            client.get_collections()
        except Exception as e:
            logger.error(f"Qdrant not available: {e}")
            logger.error("Please start Qdrant: docker run -p 6333:6333 qdrant/qdrant")
            return False

        logger.info("All dependencies available")
        return True

    def step_1_ast_extraction(self) -> bool:
        """Step 1: Extract AST from codebase"""
        logger.info("=== Step 1: AST Extraction ===")

        ast_script = self.pipeline_dir / "ast_extractor" / "extract_ast_graph.py"
        output_file = self.output_dir / "ast_data.jsonl"

        if not ast_script.exists():
            logger.error(f"AST extractor script not found: {ast_script}")
            return False

        command = [
            sys.executable, str(ast_script),
            str(self.workspace_root / "sveltekit-frontend"),  # Source directory
            str(output_file)
        ]

        return self.run_command(command)

    def step_2_build_embeddings(self) -> bool:
        """Step 2: Build embeddings from AST data"""
        logger.info("=== Step 2: Building Embeddings ===")

        embed_script = self.pipeline_dir / "embeddings" / "build_embedding_index.py"
        input_file = self.output_dir / "ast_data.jsonl"
        output_file = self.output_dir / "embeddings_data.jsonl"

        if not embed_script.exists():
            logger.error(f"Embeddings script not found: {embed_script}")
            return False

        if not input_file.exists():
            logger.error(f"AST data not found: {input_file}")
            return False

        command = [
            sys.executable, str(embed_script),
            str(input_file),
            str(output_file)
        ]

        return self.run_command(command)

    def step_3_clustering(self) -> bool:
        """Step 3: Cluster and deduplicate embeddings"""
        logger.info("=== Step 3: Clustering and Deduplication ===")

        cluster_script = self.pipeline_dir / "clustering" / "dedup_and_cluster.py"
        input_file = self.output_dir / "embeddings_data.jsonl"
        output_file = self.output_dir / "clustered_data.jsonl"

        if not cluster_script.exists():
            logger.error(f"Clustering script not found: {cluster_script}")
            return False

        if not input_file.exists():
            logger.error(f"Embeddings data not found: {input_file}")
            return False

        command = [
            sys.executable, str(cluster_script),
            str(input_file),
            str(output_file)
        ]

        return self.run_command(command)

    def step_4_build_dataset(self) -> bool:
        """Step 4: Build training dataset"""
        logger.info("=== Step 4: Building Training Dataset ===")

        dataset_script = self.pipeline_dir / "dataset_builder" / "build_training_jsonl.py"
        input_file = self.output_dir / "clustered_data.jsonl"
        output_file = self.output_dir / "training_dataset.jsonl"

        if not dataset_script.exists():
            logger.error(f"Dataset builder script not found: {dataset_script}")
            return False

        if not input_file.exists():
            logger.error(f"Clustered data not found: {input_file}")
            return False

        command = [
            sys.executable, str(dataset_script),
            str(input_file),
            str(output_file)
        ]

        return self.run_command(command)

    def step_5_web_scraping(self) -> bool:
        """Step 5: Scrape additional training data from web"""
        logger.info("=== Step 5: Web Scraping (Optional) ===")

        scrape_script = self.pipeline_dir / "web_scraper" / "scrape_docs_to_jsonl.py"
        output_file = self.output_dir / "web_scraped_data.jsonl"

        if not scrape_script.exists():
            logger.warning(f"Web scraper script not found: {scrape_script}")
            return True  # Optional step

        command = [
            sys.executable, str(scrape_script),
            str(output_file)
        ]

        success = self.run_command(command)
        if success:
            # Merge web data with main dataset
            self._merge_datasets()

        return success

    def _merge_datasets(self):
        """Merge web scraped data with main training dataset"""
        main_dataset = self.output_dir / "training_dataset.jsonl"
        web_dataset = self.output_dir / "web_scraped_data.jsonl"
        merged_dataset = self.output_dir / "final_training_dataset.jsonl"

        if not main_dataset.exists():
            logger.warning("Main dataset not found for merging")
            return

        logger.info("Merging datasets...")

        all_examples = []

        # Load main dataset
        with open(main_dataset, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    all_examples.append(json.loads(line.strip()))
                except json.JSONDecodeError:
                    continue

        # Load web dataset if exists
        if web_dataset.exists():
            with open(web_dataset, 'r', encoding='utf-8') as f:
                for line in f:
                    try:
                        all_examples.append(json.loads(line.strip()))
                    except json.JSONDecodeError:
                        continue

        # Save merged dataset
        with open(merged_dataset, 'w', encoding='utf-8') as f:
            for example in all_examples:
                json.dump(example, f, ensure_ascii=False)
                f.write('\n')

        logger.info(f"Merged dataset saved to {merged_dataset} ({len(all_examples)} examples)")

    def generate_pipeline_report(self) -> Dict[str, Any]:
        """Generate a report of the pipeline execution"""
        report = {
            'pipeline_version': 'Phase 46',
            'execution_time': time.time(),
            'steps_completed': [],
            'output_files': {},
            'statistics': {}
        }

        # Check output files
        output_files = [
            'ast_data.jsonl',
            'embeddings_data.jsonl',
            'clustered_data.jsonl',
            'training_dataset.jsonl',
            'web_scraped_data.jsonl',
            'final_training_dataset.jsonl'
        ]

        for filename in output_files:
            filepath = self.output_dir / filename
            if filepath.exists():
                size = filepath.stat().st_size
                report['output_files'][filename] = {
                    'exists': True,
                    'size_bytes': size,
                    'size_mb': round(size / (1024 * 1024), 2)
                }
            else:
                report['output_files'][filename] = {'exists': False}

        # Count examples in final dataset
        final_dataset = self.output_dir / "final_training_dataset.jsonl"
        if final_dataset.exists():
            count = 0
            with open(final_dataset, 'r', encoding='utf-8') as f:
                for _ in f:
                    count += 1
            report['statistics']['total_examples'] = count

        return report

    def run_full_pipeline(self, skip_web_scraping: bool = False) -> bool:
        """Run the complete pipeline"""
        logger.info("🚀 Starting Phase 46 ML Pipeline")
        logger.info("=" * 50)

        start_time = time.time()

        # Check dependencies
        if not self.check_dependencies():
            logger.error("Dependency check failed")
            return False

        # Run pipeline steps
        steps = [
            ("AST Extraction", self.step_1_ast_extraction),
            ("Embedding Building", self.step_2_build_embeddings),
            ("Clustering", self.step_3_clustering),
            ("Dataset Building", self.step_4_build_dataset)
        ]

        if not skip_web_scraping:
            steps.append(("Web Scraping", self.step_5_web_scraping))

        completed_steps = []

        for step_name, step_func in steps:
            logger.info(f"Starting {step_name}...")
            if step_func():
                completed_steps.append(step_name)
                logger.info(f"✅ {step_name} completed")
            else:
                logger.error(f"❌ {step_name} failed")
                return False

        # Generate report
        end_time = time.time()
        duration = end_time - start_time

        report = self.generate_pipeline_report()
        report['total_duration_seconds'] = duration
        report['steps_completed'] = completed_steps

        # Save report
        report_file = self.output_dir / "pipeline_report.json"
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

        logger.info(f"Pipeline completed in {duration:.2f} seconds")
        logger.info(f"📊 Pipeline report saved to: {report_file}")
        logger.info("🎉 Phase 46 ML Pipeline completed successfully!")

        return True

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Run Phase 46 ML Pipeline")
    parser.add_argument("--workspace", default=".", help="Workspace root directory")
    parser.add_argument("--skip-web-scraping", action="store_true", help="Skip web scraping step")
    parser.add_argument("--check-only", action="store_true", help="Only check dependencies")

    args = parser.parse_args()

    orchestrator = PipelineOrchestrator(args.workspace)

    if args.check_only:
        success = orchestrator.check_dependencies()
        sys.exit(0 if success else 1)

    success = orchestrator.run_full_pipeline(skip_web_scraping=args.skip_web_scraping)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()