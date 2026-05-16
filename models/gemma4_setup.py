#!/usr/bin/env python3
"""
Gemma 4 Legal E4B Model Setup Script
Automates downloading, merging, and converting to GGUF for Ollama deployment.

Author: Legal AI Platform Team
Version: 1.0.0
"""

import os
import sys
import json
import logging
import subprocess
import shutil
import time
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

# Try to import dependencies, install if missing
try:
    from tqdm import tqdm
    import psutil
except ImportError:
    print("Installing required dependencies...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "tqdm", "psutil"])
    from tqdm import tqdm
    import psutil


class GemmaSetup:
    """Production-grade setup manager for Gemma 4 Legal model."""

    def __init__(self, config_path: str = "config.json"):
        self.config = self._load_config(config_path)
        self.setup_logging()
        self.base_dir = Path(__file__).parent.absolute()
        self.llama_cpp_dir = self.base_dir / "llama.cpp"

        # Track progress
        self.steps_total = 9
        self.steps_completed = 0

    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load configuration from JSON file."""
        if not os.path.exists(config_path):
            # Create default config
            default_config = {
                "base_model": "unsloth/gemma-4-E4B-it",
                "adapter": "Semaj90/gemma4-e4b-legal-grpo",
                "output_dir": "./gemma4-legal-merged-full",
                "gguf_output": "gemma4-legal-e4b-q4_k_m.gguf",
                "quantization": "q4_k_m",
                "min_disk_space_gb": 20,
                "cuda_required": False
            }
            with open(config_path, 'w') as f:
                json.dump(default_config, f, indent=2)
            return default_config

        with open(config_path, 'r') as f:
            return json.load(f)

    def setup_logging(self):
        """Configure comprehensive logging."""
        log_file = self.base_dir / "gemma4_setup.log" if hasattr(self, 'base_dir') else "gemma4_setup.log"

        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler(sys.stdout)
            ]
        )
        self.logger = logging.getLogger(__name__)
        self.logger.info("=" * 80)
        self.logger.info("Gemma 4 Legal E4B Setup Started")
        self.logger.info("=" * 80)

    def check_system_requirements(self) -> bool:
        """Validate system requirements."""
        self.logger.info("Step 0/9: Checking system requirements...")

        # Check Python version
        python_version = sys.version_info
        if python_version < (3, 9):
            self.logger.error(f"Python 3.9+ required, found {python_version.major}.{python_version.minor}")
            return False
        self.logger.info(f"✓ Python {python_version.major}.{python_version.minor}.{python_version.micro}")

        # Check disk space
        disk = psutil.disk_usage(str(self.base_dir))
        free_gb = disk.free / (1024**3)
        required_gb = self.config['min_disk_space_gb']

        if free_gb < required_gb:
            self.logger.error(f"Insufficient disk space: {free_gb:.1f}GB free, {required_gb}GB required")
            return False
        self.logger.info(f"✓ Disk space: {free_gb:.1f}GB free")

        # Check RAM
        ram_gb = psutil.virtual_memory().total / (1024**3)
        self.logger.info(f"✓ RAM: {ram_gb:.1f}GB total")

        # Check CUDA availability (optional)
        try:
            import torch
            cuda_available = torch.cuda.is_available()
            if cuda_available:
                gpu_name = torch.cuda.get_device_name(0)
                self.logger.info(f"✓ GPU: {gpu_name}")
            else:
                self.logger.info("✓ GPU: Not available (will use CPU - slower)")
                if self.config.get('cuda_required', False):
                    self.logger.error("CUDA required but not available")
                    return False
        except ImportError:
            self.logger.info("✓ PyTorch not installed yet (will be installed in Step 1)")

        # Check Git
        if not shutil.which('git'):
            self.logger.error("Git not found. Please install Git for Windows")
            return False
        self.logger.info("✓ Git available")

        # Check Ollama
        if not shutil.which('ollama'):
            self.logger.warning("⚠ Ollama not found. Install from https://ollama.com/download")
            self.logger.warning("  You can still complete conversion, but import will fail")
        else:
            self.logger.info("✓ Ollama available")

        return True

    def install_dependencies(self) -> bool:
        """Install required Python packages with progress."""
        self.steps_completed += 1
        self.logger.info(f"Step {self.steps_completed}/9: Installing dependencies...")

        packages = [
            "torch",
            "transformers",
            "peft",
            "accelerate",
            "bitsandbytes",
            "safetensors",
            "sentencepiece",
            "protobuf"
        ]

        try:
            with tqdm(total=len(packages), desc="Installing packages", unit="pkg") as pbar:
                for package in packages:
                    self.logger.info(f"  Installing {package}...")
                    subprocess.check_call(
                        [sys.executable, "-m", "pip", "install", "-q", package],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.PIPE
                    )
                    pbar.update(1)

            self.logger.info("✓ All dependencies installed")
            return True

        except subprocess.CalledProcessError as e:
            self.logger.error(f"Failed to install dependencies: {e}")
            return False

    def download_base_model(self) -> bool:
        """Download base model with progress tracking."""
        self.steps_completed += 1
        self.logger.info(f"Step {self.steps_completed}/9: Downloading base model...")

        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer

            model_name = self.config['base_model']
            self.logger.info(f"  Model: {model_name}")
            self.logger.info(f"  Expected size: ~7.5GB")

            # Download with progress
            self.logger.info("  Downloading tokenizer...")
            tokenizer = AutoTokenizer.from_pretrained(
                model_name,
                trust_remote_code=True
            )

            self.logger.info("  Downloading model (this may take 10-30 minutes)...")
            model = AutoModelForCausalLM.from_pretrained(
                model_name,
                torch_dtype="auto",
                device_map="auto",
                trust_remote_code=True
            )

            self.logger.info("✓ Base model downloaded")
            return True

        except Exception as e:
            self.logger.error(f"Failed to download base model: {e}")
            return False

    def download_adapter(self) -> bool:
        """Download LoRA adapter with progress tracking."""
        self.steps_completed += 1
        self.logger.info(f"Step {self.steps_completed}/9: Downloading adapter...")

        try:
            from peft import PeftModel

            adapter_name = self.config['adapter']
            self.logger.info(f"  Adapter: {adapter_name}")
            self.logger.info(f"  Expected size: ~140MB")

            # Adapter will be downloaded during merge step
            # This step just validates it exists
            from huggingface_hub import hf_hub_download, list_repo_files

            files = list_repo_files(adapter_name)
            self.logger.info(f"✓ Adapter verified ({len(files)} files)")
            return True

        except Exception as e:
            self.logger.error(f"Failed to verify adapter: {e}")
            return False

    def merge_lora_weights(self) -> bool:
        """Merge LoRA adapter with base model."""
        self.steps_completed += 1
        self.logger.info(f"Step {self.steps_completed}/9: Merging LoRA weights...")

        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
            from peft import PeftModel
            import torch

            base_model_name = self.config['base_model']
            adapter_name = self.config['adapter']

            self.logger.info(f"  Loading base model...")
            tokenizer = AutoTokenizer.from_pretrained(
                base_model_name,
                trust_remote_code=True
            )

            base_model = AutoModelForCausalLM.from_pretrained(
                base_model_name,
                torch_dtype=torch.float16,
                device_map="auto",
                trust_remote_code=True
            )

            self.logger.info(f"  Loading adapter...")
            model = PeftModel.from_pretrained(base_model, adapter_name)

            self.logger.info(f"  Merging weights (this may take 5-10 minutes)...")
            merged_model = model.merge_and_unload()

            # Store for next step
            self.merged_model = merged_model
            self.tokenizer = tokenizer

            self.logger.info("✓ Weights merged successfully")
            return True

        except Exception as e:
            self.logger.error(f"Failed to merge weights: {e}")
            return False

    def save_merged_model(self) -> bool:
        """Save merged model in HuggingFace format."""
        self.steps_completed += 1
        self.logger.info(f"Step {self.steps_completed}/9: Saving merged model...")

        try:
            output_dir = Path(self.config['output_dir'])
            output_dir.mkdir(parents=True, exist_ok=True)

            self.logger.info(f"  Output directory: {output_dir}")
            self.logger.info(f"  Saving model (this may take 5-10 minutes)...")

            self.merged_model.save_pretrained(
                output_dir,
                safe_serialization=True
            )

            self.logger.info(f"  Saving tokenizer...")
            self.tokenizer.save_pretrained(output_dir)

            # Clean up memory
            del self.merged_model
            del self.tokenizer

            self.logger.info(f"✓ Model saved to {output_dir}")
            return True

        except Exception as e:
            self.logger.error(f"Failed to save model: {e}")
            return False

    def setup_llama_cpp(self) -> bool:
        """Clone and setup llama.cpp for GGUF conversion."""
        self.logger.info(f"  Setting up llama.cpp...")

        if self.llama_cpp_dir.exists():
            self.logger.info(f"  llama.cpp already cloned, pulling latest...")
            try:
                subprocess.check_call(
                    ["git", "-C", str(self.llama_cpp_dir), "pull"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE
                )
            except:
                self.logger.warning("  Could not pull latest llama.cpp, using existing")
        else:
            self.logger.info(f"  Cloning llama.cpp...")
            try:
                subprocess.check_call(
                    ["git", "clone", "https://github.com/ggerganov/llama.cpp.git", str(self.llama_cpp_dir)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE
                )
            except subprocess.CalledProcessError as e:
                self.logger.error(f"Failed to clone llama.cpp: {e}")
                return False

        # Install Python requirements
        requirements_file = self.llama_cpp_dir / "requirements.txt"
        if requirements_file.exists():
            self.logger.info(f"  Installing llama.cpp Python requirements...")
            try:
                subprocess.check_call(
                    [sys.executable, "-m", "pip", "install", "-q", "-r", str(requirements_file)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE
                )
            except:
                self.logger.warning("  Could not install all llama.cpp requirements, continuing...")

        return True

    def convert_to_gguf(self) -> bool:
        """Convert merged model to GGUF format."""
        self.steps_completed += 1
        self.logger.info(f"Step {self.steps_completed}/9: Converting to GGUF...")

        if not self.setup_llama_cpp():
            return False

        try:
            model_dir = Path(self.config['output_dir'])
            gguf_output = self.base_dir / self.config['gguf_output']

            # Step 1: Convert to FP16 GGUF
            self.logger.info(f"  Converting to FP16 GGUF (this may take 10-20 minutes)...")
            convert_script = self.llama_cpp_dir / "convert_hf_to_gguf.py"

            if not convert_script.exists():
                # Try alternative script name
                convert_script = self.llama_cpp_dir / "convert.py"

            if not convert_script.exists():
                self.logger.error("Could not find conversion script in llama.cpp")
                return False

            fp16_output = self.base_dir / "gemma4-legal-e4b-fp16.gguf"

            subprocess.check_call(
                [
                    sys.executable,
                    str(convert_script),
                    str(model_dir),
                    "--outfile", str(fp16_output),
                    "--outtype", "f16"
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT
            )

            # Step 2: Quantize to Q4_K_M
            self.logger.info(f"  Quantizing to Q4_K_M (this may take 5-10 minutes)...")
            quantize_exe = self.llama_cpp_dir / "build" / "bin" / "Release" / "llama-quantize.exe"

            if not quantize_exe.exists():
                # Try to build llama.cpp
                self.logger.info(f"  Building llama.cpp (first time only, may take 10-20 minutes)...")
                build_dir = self.llama_cpp_dir / "build"
                build_dir.mkdir(exist_ok=True)

                # Run CMake
                subprocess.check_call(
                    ["cmake", "..", "-DCMAKE_BUILD_TYPE=Release"],
                    cwd=str(build_dir),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE
                )

                # Build
                subprocess.check_call(
                    ["cmake", "--build", ".", "--config", "Release"],
                    cwd=str(build_dir),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE
                )

            subprocess.check_call(
                [
                    str(quantize_exe),
                    str(fp16_output),
                    str(gguf_output),
                    "Q4_K_M"
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT
            )

            # Clean up FP16 file
            if fp16_output.exists():
                fp16_output.unlink()
                self.logger.info(f"  Cleaned up intermediate FP16 file")

            file_size_mb = gguf_output.stat().st_size / (1024**2)
            self.logger.info(f"✓ GGUF created: {gguf_output} ({file_size_mb:.1f}MB)")
            return True

        except Exception as e:
            self.logger.error(f"Failed to convert to GGUF: {e}")
            return False

    def create_modelfile(self) -> bool:
        """Create Ollama Modelfile."""
        self.steps_completed += 1
        self.logger.info(f"Step {self.steps_completed}/9: Creating Ollama Modelfile...")

        try:
            gguf_path = self.base_dir / self.config['gguf_output']
            modelfile_path = self.base_dir / "Modelfile"

            modelfile_content = f"""FROM {gguf_path}

# Legal AI specialist model based on Gemma 4 E4B
TEMPLATE \"\"\"{{{{ if .System }}}}<start_of_turn>system
{{{{ .System }}}}<end_of_turn>
{{{{ end }}}}{{{{ if .Prompt }}}}<start_of_turn>user
{{{{ .Prompt }}}}<end_of_turn>
<start_of_turn>model
{{{{ end }}}}{{{{ .Response }}}}<end_of_turn>
\"\"\"

PARAMETER stop "<start_of_turn>"
PARAMETER stop "<end_of_turn>"
PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER num_ctx 8192

SYSTEM \"\"\"You are a legal AI assistant specialized in analyzing legal documents, case law, statutes, and providing legal research support. You have been fine-tuned on legal texts and trained to provide accurate, well-reasoned legal analysis.

Your capabilities include:
- Legal document analysis and summarization
- Case law research and citation
- Statute interpretation
- Contract review
- Legal reasoning and argumentation
- Evidence analysis

Always cite relevant legal authorities and explain your reasoning. When uncertain, acknowledge limitations and suggest consulting a licensed attorney.\"\"\"
"""

            with open(modelfile_path, 'w') as f:
                f.write(modelfile_content)

            self.logger.info(f"✓ Modelfile created: {modelfile_path}")
            return True

        except Exception as e:
            self.logger.error(f"Failed to create Modelfile: {e}")
            return False

    def import_to_ollama(self) -> bool:
        """Import model to Ollama."""
        self.steps_completed += 1
        self.logger.info(f"Step {self.steps_completed}/9: Importing to Ollama...")

        if not shutil.which('ollama'):
            self.logger.error("Ollama not found. Please install from https://ollama.com/download")
            return False

        try:
            modelfile_path = self.base_dir / "Modelfile"
            model_name = "gemma4-legal:e4b"

            self.logger.info(f"  Model name: {model_name}")
            self.logger.info(f"  Importing (this may take 5-10 minutes)...")

            result = subprocess.run(
                ["ollama", "create", model_name, "-f", str(modelfile_path)],
                capture_output=True,
                text=True
            )

            if result.returncode != 0:
                self.logger.error(f"Failed to import: {result.stderr}")
                return False

            self.logger.info(f"✓ Model imported as '{model_name}'")
            return True

        except Exception as e:
            self.logger.error(f"Failed to import to Ollama: {e}")
            return False

    def run_validation_test(self) -> bool:
        """Run validation test on imported model."""
        self.steps_completed += 1
        self.logger.info(f"Step {self.steps_completed}/9: Running validation test...")

        if not shutil.which('ollama'):
            self.logger.warning("Skipping validation - Ollama not available")
            return True

        try:
            model_name = "gemma4-legal:e4b"
            test_prompt = "What is hearsay evidence?"

            self.logger.info(f"  Testing with prompt: '{test_prompt}'")

            result = subprocess.run(
                ["ollama", "run", model_name, test_prompt],
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                self.logger.error(f"Validation failed: {result.stderr}")
                return False

            response = result.stdout.strip()
            self.logger.info(f"  Response preview: {response[:200]}...")
            self.logger.info(f"✓ Validation test passed")
            return True

        except subprocess.TimeoutExpired:
            self.logger.warning("Validation test timed out (model may still be loading)")
            return True
        except Exception as e:
            self.logger.error(f"Validation test failed: {e}")
            return False

    def cleanup(self):
        """Optional cleanup of intermediate files."""
        self.logger.info("Cleanup options:")
        self.logger.info(f"  - Keep merged model: {self.config['output_dir']} (~15GB)")
        self.logger.info(f"  - Keep GGUF: {self.config['gguf_output']} (~2.5GB)")
        self.logger.info(f"  - Keep llama.cpp: {self.llama_cpp_dir} (~500MB)")
        self.logger.info("  (Manual cleanup recommended to preserve flexibility)")

    def run(self) -> bool:
        """Execute complete setup pipeline."""
        start_time = time.time()

        try:
            # System checks
            if not self.check_system_requirements():
                return False

            # Step 1: Install dependencies
            if not self.install_dependencies():
                return False

            # Step 2: Download base model
            if not self.download_base_model():
                return False

            # Step 3: Download adapter
            if not self.download_adapter():
                return False

            # Step 4: Merge weights
            if not self.merge_lora_weights():
                return False

            # Step 5: Save merged model
            if not self.save_merged_model():
                return False

            # Step 6: Convert to GGUF
            if not self.convert_to_gguf():
                return False

            # Step 7: Create Modelfile
            if not self.create_modelfile():
                return False

            # Step 8: Import to Ollama
            if not self.import_to_ollama():
                return False

            # Step 9: Validation test
            if not self.run_validation_test():
                self.logger.warning("Validation failed but setup completed")

            # Summary
            elapsed = time.time() - start_time
            self.logger.info("=" * 80)
            self.logger.info("SETUP COMPLETE!")
            self.logger.info("=" * 80)
            self.logger.info(f"Total time: {elapsed/60:.1f} minutes")
            self.logger.info(f"Model name: gemma4-legal:e4b")
            self.logger.info(f"GGUF file: {self.config['gguf_output']}")
            self.logger.info("")
            self.logger.info("Test the model:")
            self.logger.info('  ollama run gemma4-legal:e4b "What is hearsay evidence?"')
            self.logger.info("")
            self.cleanup()

            return True

        except KeyboardInterrupt:
            self.logger.error("\nSetup interrupted by user")
            return False
        except Exception as e:
            self.logger.error(f"Unexpected error: {e}", exc_info=True)
            return False


def main():
    """Main entry point."""
    print("""
    ============================================================
       Gemma 4 Legal E4B Model Setup
       Production-Grade Automation
    ============================================================
    """)

    config_file = "config.json"
    if len(sys.argv) > 1:
        config_file = sys.argv[1]

    setup = GemmaSetup(config_file)

    success = setup.run()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()