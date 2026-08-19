import numpy as np
import torch

from atlas_compute.latent_autoencoder import (
    NestedAutoencoderConfig,
    NestedSemanticAutoencoder,
    exact_knn_indices,
    knn_recall,
    nested_autoencoder_loss,
)


def test_nested_latent64_is_prefix_of_latent128():
    torch.manual_seed(7)
    model = NestedSemanticAutoencoder()
    source = torch.randn(8, 768)
    latent128, latent64 = model.encode(source)
    expected = torch.nn.functional.normalize(latent128[:, :64], p=2, dim=-1)
    assert latent128.shape == (8, 128)
    assert latent64.shape == (8, 64)
    assert torch.allclose(latent64, expected, atol=1e-6)


def test_forward_reconstructs_to_semantic_768_shape():
    model = NestedSemanticAutoencoder()
    outputs = model(torch.randn(4, 768))
    assert outputs['decoded128'].shape == (4, 768)
    assert outputs['decoded64'].shape == (4, 768)


def test_nested_loss_is_finite():
    config = NestedAutoencoderConfig(seed=11)
    model = NestedSemanticAutoencoder(config)
    outputs = model(torch.randn(6, 768))
    loss, metrics = nested_autoencoder_loss(outputs, config)
    assert torch.isfinite(loss)
    assert metrics['loss'] >= 0
    assert metrics['mse128'] >= 0
    assert metrics['mse64'] >= 0


def test_exact_knn_rejects_invalid_k():
    matrix = np.eye(4, dtype=np.float32)
    try:
        exact_knn_indices(matrix, 4)
    except ValueError as exc:
        assert 'k must be positive' in str(exc)
    else:
        raise AssertionError('expected invalid k rejection')


def test_knn_recall_is_one_for_identical_representation():
    rng = np.random.default_rng(5)
    matrix = rng.normal(size=(16, 12)).astype(np.float32)
    assert knn_recall(matrix, matrix.copy(), 3) == 1.0
