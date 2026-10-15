from __future__ import annotations

import math

import numpy as np
import pytest

from atlas_compute.xgboost_binary_logistic_reference_v1 import (
    binary_logistic_gradient_hessian_v1,
    binary_logistic_loss_v1,
)


@pytest.mark.parametrize("margin,label", [(-8.0, 0.0), (-1.25, 1.0), (0.0, 0.0), (0.7, 1.0), (6.0, 0.0)])
def test_binary_logistic_gradient_and_hessian_match_finite_differences(
    margin: float, label: float
) -> None:
    gradient, hessian = binary_logistic_gradient_hessian_v1(margin, label)
    step = 1e-3
    loss_center = binary_logistic_loss_v1(margin, label)
    loss_plus = binary_logistic_loss_v1(margin + step, label)
    loss_minus = binary_logistic_loss_v1(margin - step, label)
    numeric_gradient = (loss_plus - loss_minus) / (2.0 * step)
    numeric_hessian = (loss_plus - 2.0 * loss_center + loss_minus) / (step * step)
    assert gradient == pytest.approx(numeric_gradient, abs=2e-7)
    assert hessian == pytest.approx(numeric_hessian, abs=3e-7)
    assert hessian >= 0.0


@pytest.mark.parametrize("margin,label", [(-1000.0, 1.0), (1000.0, 0.0)])
def test_extreme_finite_margins_remain_finite(margin: float, label: float) -> None:
    loss = binary_logistic_loss_v1(margin, label)
    gradient, hessian = binary_logistic_gradient_hessian_v1(margin, label)
    assert all(math.isfinite(value) for value in (loss, gradient, hessian))


@pytest.mark.parametrize("margin,label", [(math.nan, 0.0), (0.0, 0.4)])
def test_rejects_invalid_objective_inputs(margin: float, label: float) -> None:
    with pytest.raises(ValueError):
        binary_logistic_gradient_hessian_v1(margin, label)


def test_xgboost_custom_objective_receives_raw_margins_and_labels() -> None:
    xgb = pytest.importorskip("xgboost")
    features = np.asarray([[0.0], [1.0], [-1.0]], dtype=np.float32)
    labels = np.asarray([0.0, 1.0, 0.0], dtype=np.float32)
    base_margins = np.asarray([-1.25, 0.0, 0.7], dtype=np.float32)
    matrix = xgb.DMatrix(features, label=labels, base_margin=base_margins)
    observed: list[tuple[np.ndarray, np.ndarray, np.ndarray]] = []

    def objective(margins: np.ndarray, data: object) -> tuple[np.ndarray, np.ndarray]:
        callback_labels = data.get_label()
        pairs = [
            binary_logistic_gradient_hessian_v1(float(margin), float(label))
            for margin, label in zip(margins, callback_labels, strict=True)
        ]
        gradients = np.asarray([pair[0] for pair in pairs], dtype=np.float32)
        hessians = np.asarray([pair[1] for pair in pairs], dtype=np.float32)
        observed.append((margins.copy(), gradients, hessians))
        return gradients, hessians

    params = {
        "base_score": 0.5,
        "max_depth": 2,
        "eta": 0.2,
        "min_child_weight": 0,
        "lambda": 0.0,
        "gamma": 0.0,
        "nthread": 1,
        "tree_method": "hist",
    }
    custom_booster = xgb.train(
        params,
        matrix,
        num_boost_round=2,
        obj=objective,
    )
    built_in_booster = xgb.train(
        {**params, "objective": "binary:logistic"},
        matrix,
        num_boost_round=2,
    )

    assert len(observed) == 2
    np.testing.assert_allclose(observed[0][0], base_margins, atol=1e-7)
    expected = [
        binary_logistic_gradient_hessian_v1(float(margin), float(label))
        for margin, label in zip(base_margins, labels, strict=True)
    ]
    np.testing.assert_allclose(observed[0][1], [pair[0] for pair in expected], rtol=1e-6)
    np.testing.assert_allclose(observed[0][2], [pair[1] for pair in expected], rtol=1e-6)
    np.testing.assert_allclose(
        custom_booster.predict(matrix, output_margin=True),
        built_in_booster.predict(matrix, output_margin=True),
        rtol=1e-7,
        atol=1e-7,
    )

