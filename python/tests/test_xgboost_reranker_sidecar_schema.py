import ast
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SIDECAR_PATH = ROOT / 'scripts' / 'atlas' / 'serve-xgboost-reranker.py'
SIDECAR_SPEC = importlib.util.spec_from_file_location('serve_xgboost_reranker', SIDECAR_PATH)
if SIDECAR_SPEC is None or SIDECAR_SPEC.loader is None:
    raise ImportError(f'Cannot load sidecar module: {SIDECAR_PATH}')
serve_xgboost_reranker = importlib.util.module_from_spec(SIDECAR_SPEC)
SIDECAR_SPEC.loader.exec_module(serve_xgboost_reranker)


def read_feature_columns(path: Path) -> list[str]:
    module = ast.parse(path.read_text(encoding='utf-8'))
    for node in module.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == 'FEATURE_COLS'
            for target in node.targets
        ):
            return ast.literal_eval(node.value)
    raise AssertionError(f'FEATURE_COLS missing from {path}')


class XgboostRerankerSidecarSchemaTests(unittest.TestCase):
    def test_training_and_serving_feature_columns_are_identical(self):
        training = read_feature_columns(ROOT / 'scripts' / 'atlas' / 'train-xgboost-reranker.py')
        self.assertEqual(training, serve_xgboost_reranker.FEATURE_COLS)

    def test_loaded_model_feature_names_must_match_in_order(self):
        serve_xgboost_reranker.validate_model_feature_schema(
            serve_xgboost_reranker.FEATURE_COLS,
            'xgboost',
        )

        reordered = list(serve_xgboost_reranker.FEATURE_COLS)
        reordered[0], reordered[1] = reordered[1], reordered[0]
        with self.assertRaisesRegex(ValueError, 'MODEL_FEATURE_SCHEMA_MISMATCH:xgboost'):
            serve_xgboost_reranker.validate_model_feature_schema(reordered, 'xgboost')

    def test_missing_model_feature_names_are_refused(self):
        with self.assertRaisesRegex(ValueError, 'MODEL_FEATURE_SCHEMA_MISMATCH:lightgbm'):
            serve_xgboost_reranker.validate_model_feature_schema(None, 'lightgbm')


if __name__ == '__main__':
    unittest.main()
