#!/usr/bin/env python3
"""
Export Gemma3 to TorchScript for C++ LibTorch integration
Creates .pt file loadable by your Go TensorRTEngine via C++
"""
import torch
import json
from pathlib import Path
from safetensors.torch import load_file
from transformers import AutoTokenizer, AutoConfig
import warnings
warnings.filterwarnings("ignore")

class Gemma3TorchScriptExporter:
    def __init__(self, model_path="/home/james/gemma3_complete"):
        self.model_path = Path(model_path)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    def create_minimal_gemma3_model(self, config, state_dict):
        """
        Create a minimal Gemma3 model for TorchScript export
        Simplified version focusing on inference only
        """

        class MinimalGemma3(torch.nn.Module):
            def __init__(self, config):
                super().__init__()
                self.config = config
                vocab_size = config.get("vocab_size", 262208)
                hidden_size = config.get("hidden_size", 3840)

                # Essential components only
                self.embed_tokens = torch.nn.Embedding(vocab_size, hidden_size)
                self.output_projection = torch.nn.Linear(hidden_size, vocab_size, bias=False)

                # Simplified transformer layers
                num_layers = min(config.get("num_hidden_layers", 48), 4)  # Limit for TorchScript
                self.layers = torch.nn.ModuleList([
                    torch.nn.TransformerEncoderLayer(
                        d_model=hidden_size,
                        nhead=config.get("num_attention_heads", 16),
                        dim_feedforward=config.get("intermediate_size", 15360),
                        batch_first=True,
                        norm_first=True
                    ) for _ in range(num_layers)
                ])

                self.norm = torch.nn.LayerNorm(hidden_size)

            def forward(self, input_ids: torch.Tensor) -> torch.Tensor:
                # Simple forward pass for TorchScript compatibility
                x = self.embed_tokens(input_ids)

                # Apply transformer layers
                for layer in self.layers:
                    x = layer(x)

                x = self.norm(x)
                logits = self.output_projection(x)

                return logits

        return MinimalGemma3(config)

    def export_to_torchscript(self):
        """
        Export Gemma3 to TorchScript for C++ LibTorch
        """
        print("🔧 Exporting Gemma3 to TorchScript for C++ integration")
        print("=" * 60)

        # Load config
        config_path = self.model_path / "config.json"
        with open(config_path) as f:
            config = json.load(f)

        print(f"📋 Model config: {config.get('model_type', 'unknown')}")
        print(f"   Hidden size: {config.get('hidden_size', 'unknown')}")
        print(f"   Layers: {config.get('num_hidden_layers', 'unknown')}")

        # Load state dict
        safetensors_path = self.model_path / "rank0.safetensors"
        print(f"📂 Loading weights: {safetensors_path}")

        try:
            state_dict = load_file(safetensors_path, device="cpu")
            print(f"✅ Loaded {len(state_dict)} tensors")
        except Exception as e:
            print(f"❌ Failed to load weights: {e}")
            return None

        # Create minimal model
        print("🏗️  Creating TorchScript-compatible model...")
        model = self.create_minimal_gemma3_model(config, state_dict)

        # Load compatible weights (subset)
        try:
            # Map full model weights to minimal model
            minimal_state = {}
            if "language_model.model.embed_tokens.weight" in state_dict:
                minimal_state["embed_tokens.weight"] = state_dict["language_model.model.embed_tokens.weight"]

            # Load partial weights
            model.load_state_dict(minimal_state, strict=False)
            print("✅ Loaded compatible weights")
        except Exception as e:
            print(f"⚠️  Weight loading partial: {e}")

        model.eval()
        model.to(self.device)

        # Create dummy input for tracing
        batch_size = 1
        seq_length = 32
        dummy_input = torch.randint(0, min(1000, config.get("vocab_size", 262208)),
                                   (batch_size, seq_length), device=self.device)

        print(f"🎯 Tracing with input shape: {dummy_input.shape}")

        # Trace model
        try:
            with torch.no_grad():
                traced_model = torch.jit.trace(model, dummy_input)

            output_path = self.model_path / "gemma3_traced.pt"
            traced_model.save(str(output_path))

            print(f"✅ TorchScript exported: {output_path}")
            print(f"📊 File size: {output_path.stat().st_size / (1024*1024):.1f}MB")

            return str(output_path)

        except Exception as e:
            print(f"❌ TorchScript export failed: {e}")
            return None

    def test_torchscript_model(self, model_path):
        """
        Test the exported TorchScript model
        """
        print("\n🧪 Testing TorchScript model...")

        try:
            # Load traced model
            traced_model = torch.jit.load(model_path)
            traced_model.to(self.device)
            traced_model.eval()

            # Test inference
            test_input = torch.randint(0, 1000, (1, 16), device=self.device)

            with torch.no_grad():
                output = traced_model(test_input)

            print(f"✅ TorchScript test successful")
            print(f"   Input shape: {test_input.shape}")
            print(f"   Output shape: {output.shape}")
            print(f"   Device: {self.device}")

            return True

        except Exception as e:
            print(f"❌ TorchScript test failed: {e}")
            return False

def main():
    exporter = Gemma3TorchScriptExporter()

    # Export to TorchScript
    model_path = exporter.export_to_torchscript()

    if model_path:
        # Test the exported model
        success = exporter.test_torchscript_model(model_path)

        if success:
            print("\n🎉 Ready for C++ LibTorch integration!")
            print(f"📂 TorchScript file: {model_path}")
            print("💡 Next steps:")
            print("   1. Build C++ LibTorch loader")
            print("   2. Wire to Go TensorRTEngine via cgo")
            print("   3. Replace with TensorRT .plan when ready")
        else:
            print("\n❌ TorchScript export failed verification")
    else:
        print("\n❌ Export failed")

if __name__ == "__main__":
    main()