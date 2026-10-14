import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess

import numpy as np
import pytest
import torch


ROOT = Path(__file__).resolve().parents[1]
TRAINER_PATH = ROOT / "scripts" / "atlas" / "train-ae-pytorch.py"
JULY_EVALUATOR_PATH = ROOT / "scripts" / "atlas" / "correlation-benchmark-autoencoder.mjs"
WEIGHT_LOADER_PATH = ROOT / "scripts" / "atlas" / "load-autoencoder-weights.mjs"
JAVASCRIPT_FORWARD_PATH = ROOT / "scripts" / "atlas" / "june-autoencoder-forward.mjs"
JUNE_WEIGHTS_DIR = ROOT / "models" / "autoencoder"


def _load_training_module():
    spec = importlib.util.spec_from_file_location("session121_training_contract", TRAINER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_training_forward_matches_independent_tanh_reference():
    module = _load_training_module()
    torch.manual_seed(121013)
    model = module.Autoencoder().cpu().eval()
    inputs = torch.nn.functional.normalize(torch.randn(3, 768), p=2, dim=1)

    with torch.inference_mode():
        reconstructed, latent = model(inputs)

    x = inputs.numpy()
    parameters = {name: value.detach().cpu().numpy() for name, value in model.state_dict().items()}
    dense = lambda value, weight, bias: value @ weight.T + bias
    hidden = np.tanh(dense(x, parameters["enc1.weight"], parameters["enc1.bias"]))
    expected_latent = np.tanh(dense(hidden, parameters["enc2.weight"], parameters["enc2.bias"]))
    decoded = np.tanh(dense(expected_latent, parameters["dec1.weight"], parameters["dec1.bias"]))
    expected_reconstruction = np.tanh(dense(decoded, parameters["dec2.weight"], parameters["dec2.bias"]))

    assert latent.shape == (3, 64)
    assert reconstructed.shape == (3, 768)
    np.testing.assert_allclose(latent.numpy(), expected_latent, rtol=1e-5, atol=1e-7)
    np.testing.assert_allclose(reconstructed.numpy(), expected_reconstruction, rtol=1e-5, atol=1e-7)


def test_july_evaluator_and_june_checkpoint_family_remain_explicitly_distinct():
    trainer = TRAINER_PATH.read_text(encoding="utf-8")
    evaluator = JULY_EVALUATOR_PATH.read_text(encoding="utf-8")
    loader = WEIGHT_LOADER_PATH.read_text(encoding="utf-8")

    assert "torch.tanh(self.enc1(x))" in trainer
    assert "torch.tanh(self.enc2(h))" in trainer
    assert "torch.tanh(self.dec1(z))" in trainer
    assert "torch.tanh(self.dec2(h))" in trainer
    assert "hidden.push(Math.max(0, sum))" in evaluator
    assert "reconstructed.push(sum)" in evaluator
    assert "W_enc_768_128.npy" in loader
    assert "W_enc_128_64.npy" in loader
    assert "W_dec_64_128.npy" in loader
    assert "W_dec_128_768.npy" in loader
    assert re.search(r"input_dim\s*=\s*768", trainer)
    assert re.search(r"hidden_dim\s*=\s*128", trainer)
    assert re.search(r"latent_dim\s*=\s*64", trainer)


def test_javascript_forward_matches_pytorch_for_local_june_checkpoint():
    weight_mapping = {
        "W_enc_768_128.npy": ("enc1.weight", (128, 768)),
        "b_enc_128.npy": ("enc1.bias", (128,)),
        "W_enc_128_64.npy": ("enc2.weight", (64, 128)),
        "b_enc_64.npy": ("enc2.bias", (64,)),
        "W_dec_64_128.npy": ("dec1.weight", (128, 64)),
        "b_dec_128.npy": ("dec1.bias", (128,)),
        "W_dec_128_768.npy": ("dec2.weight", (768, 128)),
        "b_dec_768.npy": ("dec2.bias", (768,)),
    }
    missing = [name for name in weight_mapping if not (JUNE_WEIGHTS_DIR / name).is_file()]
    if missing:
        pytest.skip(f"Local June NPY checkpoint files are unavailable: {', '.join(missing)}")
    if not shutil.which("node"):
        pytest.skip("Node.js is unavailable")

    module = _load_training_module()
    model = module.Autoencoder().cpu().eval()
    state_dict = {}
    for filename, (parameter_name, expected_shape) in weight_mapping.items():
        array = np.load(JUNE_WEIGHTS_DIR / filename, allow_pickle=False)
        assert array.shape == expected_shape
        assert array.dtype == np.dtype("float32")
        state_dict[parameter_name] = torch.from_numpy(array.copy())
    model.load_state_dict(state_dict, strict=True)

    generator = np.random.default_rng(121013)
    inputs = generator.standard_normal((4, 768)).astype(np.float32)
    inputs /= np.linalg.norm(inputs, axis=1, keepdims=True)
    with torch.inference_mode():
        pytorch_reconstruction, pytorch_latent = model(torch.from_numpy(inputs))

    result = subprocess.run(
        ["node", str(JAVASCRIPT_FORWARD_PATH), f"--weights-dir={JUNE_WEIGHTS_DIR}"],
        input=json.dumps({"inputs": inputs.tolist()}),
        text=True,
        capture_output=True,
        check=True,
        timeout=30,
    )
    javascript_outputs = json.loads(result.stdout)["outputs"]
    javascript_reconstruction = np.asarray(
        [row["reconstruction"] for row in javascript_outputs], dtype=np.float32
    )
    javascript_latent = np.asarray([row["latent"] for row in javascript_outputs], dtype=np.float32)

    assert javascript_reconstruction.shape == (4, 768)
    assert javascript_latent.shape == (4, 64)
    np.testing.assert_allclose(
        javascript_reconstruction,
        pytorch_reconstruction.numpy(),
        rtol=5e-5,
        atol=5e-6,
    )
    np.testing.assert_allclose(
        javascript_latent,
        pytorch_latent.numpy(),
        rtol=5e-5,
        atol=5e-6,
    )
