import sys

sys.path.insert(0, "python")

import pytest
from fastapi import HTTPException

import atlas_neural_decoder_service as service


def test_health_is_noncanonical_and_not_text_synthesis(monkeypatch):
    monkeypatch.setattr(service.runtime, "model", None)

    health = service.health()

    assert health["canonicalAuthority"] is False
    assert health["textSynthesis"] is False
    assert health["writesPerformed"] is False
    assert health["representations"]["physical"] == "latent_256"


def test_encode_rejects_wrong_semantic_width():
    with pytest.raises(HTTPException) as error:
        service.runtime.encode([[0.0] * 767])

    assert error.value.status_code == 422


def test_decode_route_keeps_reconstruction_noncanonical(monkeypatch):
    monkeypatch.setattr(service.runtime, "decode", lambda representation, values: [[0.0] * 768 for _ in values])

    response = service.decode(service.DecodeRequest(representation="latent_256", vectors=[[0.0] * 256]))

    assert response["semantic_768"] == [[0.0] * 768]
    assert response["canonicalAuthority"] is False
    assert response["writesPerformed"] is False
