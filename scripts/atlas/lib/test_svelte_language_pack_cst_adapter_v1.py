import hashlib
import unittest

from svelte_language_pack_cst_adapter_v1 import extract_svelte_cst_observations


class Node:
    def __init__(self, node_type, start, end, children=(), is_missing=False, has_error=False):
        self.type = node_type
        self.start_byte = start
        self.end_byte = end
        self.children = list(children)
        self.is_missing = is_missing
        self.has_error = has_error or any(child.has_error for child in self.children)


class Tree:
    def __init__(self, root):
        self.root_node = root


class Parser:
    def __init__(self, root_factory):
        self.root_factory = root_factory

    def parse(self, source):
        return Tree(self.root_factory(source))


class SvelteLanguagePackCstAdapterTests(unittest.TestCase):
    def test_preserves_utf8_byte_spans_and_construct_mapping(self):
        source = "é\r\n{#if x}<p>🚀</p>{/if}".encode("utf-8")
        start = source.index(b"{#if")
        end = len(source)

        def root_factory(data):
            return Node("document", 0, len(data), [Node("if_statement", start, end)])

        result = extract_svelte_cst_observations(source, Parser(root_factory))
        observation = result["observations"][0]
        self.assertEqual(observation["kind"], "if_block")
        self.assertEqual(source[observation["startByte"]:observation["endByte"]], observation["sourceSlice"].encode())
        self.assertEqual(observation["sliceSha256"], hashlib.sha256(source[start:end]).hexdigest())
        self.assertTrue(observation["byteSliceVerified"])
        self.assertFalse(result["canonicalAuthority"])

    def test_else_if_branch_uses_the_full_branch_extent(self):
        source = b"{#if a}one{:else if b}two{:else}three{/if}"
        start = source.index(b"{:else if")
        end = source.index(b"{:else}")

        def root_factory(data):
            return Node("document", 0, len(data), [Node("else_if_block", start, end)])

        result = extract_svelte_cst_observations(source, Parser(root_factory))
        observation = result["observations"][0]
        self.assertEqual(observation["kind"], "if_block")
        self.assertEqual((observation["startByte"], observation["endByte"]), (start, end))
        self.assertEqual(source[start:end], observation["sourceSlice"].encode("utf-8"))

    def test_parser_error_is_explicit_and_coverage_is_partial(self):
        source = b"{@render children?.()}"
        start = source.index(b"@render")
        error = Node("ERROR", start, len(source))

        def root_factory(data):
            return Node("document", 0, len(data), [error], has_error=True)

        result = extract_svelte_cst_observations(source, Parser(root_factory))
        self.assertTrue(result["parserHasError"])
        self.assertEqual(result["extractionCoverage"], "PARTIAL")
        self.assertEqual(result["errors"][0]["sourceSlice"], "@render children?.()}")

    def test_non_bytes_input_is_rejected(self):
        with self.assertRaises(TypeError):
            extract_svelte_cst_observations("<p />", Parser(lambda source: Node("document", 0, len(source))))


if __name__ == "__main__":
    unittest.main()
