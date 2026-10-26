import importlib.util
import unittest
from pathlib import Path

module_path = Path(__file__).with_name("run-directory-containment-cpu-v1.py")
spec = importlib.util.spec_from_file_location("directory_containment_cpu", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DirectoryContainmentCpuTests(unittest.TestCase):
    def test_builds_exact_parent_edges_in_ordinal_space(self):
        rows = [
            {"ordinal": 0, "relativePath": "."},
            {"ordinal": 1, "relativePath": "src"},
            {"ordinal": 2, "relativePath": "src/lib"},
            {"ordinal": 3, "relativePath": "tools"},
        ]
        edges = module.build_directory_tree_edges(rows)
        self.assertEqual(
            [(edge.src_ordinal, edge.dst_ordinal, edge.kind) for edge in edges],
            [(0, 1, "DIRECTORY_CONTAINS"), (0, 3, "DIRECTORY_CONTAINS"), (1, 2, "DIRECTORY_CONTAINS")],
        )

    def test_rejects_missing_parent_and_invalid_ordinal_map(self):
        with self.assertRaisesRegex(ValueError, "DIRECTORY_PARENT_MISSING"):
            module.build_directory_tree_edges([
                {"ordinal": 0, "relativePath": "."},
                {"ordinal": 1, "relativePath": "src/lib"},
            ])
        with self.assertRaisesRegex(ValueError, "DIRECTORY_ORDINAL_SEQUENCE_INVALID"):
            module.build_directory_tree_edges([
                {"ordinal": 1, "relativePath": "."},
            ])

    def test_rejects_duplicate_or_non_normalized_directory_paths(self):
        with self.assertRaisesRegex(ValueError, "DIRECTORY_PATH_SET_INVALID"):
            module.build_directory_tree_edges([
                {"ordinal": 0, "relativePath": "."},
                {"ordinal": 1, "relativePath": "."},
            ])
        with self.assertRaisesRegex(ValueError, "DIRECTORY_PATH_INVALID"):
            module.build_directory_tree_edges([
                {"ordinal": 0, "relativePath": "."},
                {"ordinal": 1, "relativePath": "src\\lib"},
            ])


if __name__ == "__main__":
    unittest.main()
