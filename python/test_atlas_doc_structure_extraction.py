"""Tests for extract_structured_text (parent-atlas-versioned-doc-intelligence, DOC-04).

Real HTML fixtures (no network) exercising heading/code-block/table/inline-code
preservation -- the gap the pre-DOC-04 fetch_beautifulsoup() had, where
main.get_text("\n", strip=True) flattened everything into unstructured prose,
losing exactly the structure DOC-05's chunk-level codeBlocks/apiSignatures need.
"""

from __future__ import annotations

import unittest

from atlas_external_docs import _heading_sections, extract_structured_text


class StructuredTextExtractionTests(unittest.TestCase):
    def test_headings_become_hash_prefixed_lines_matching_chunker_regex(self) -> None:
        html = b"<html><body><main><h1>Top</h1><p>intro</p><h2>Sub</h2><p>detail</p></main></body></html>"
        _title, text, _urls = extract_structured_text(html, base_url="https://example.test/docs/")
        self.assertIn("# Top", text.splitlines())
        self.assertIn("## Sub", text.splitlines())
        # The whole point of DOC-04: _heading_sections() (the existing chunker) must
        # now actually split on real HTML headings, not just literal markdown input.
        sections = _heading_sections(text)
        self.assertEqual(len(sections), 2)
        self.assertEqual(sections[0][0], ("Top",))
        self.assertEqual(sections[1][0], ("Top", "Sub"))

    def test_code_block_language_detected_and_indentation_preserved(self) -> None:
        html = (
            b'<html><body><main><h1>T</h1>'
            b'<pre><code class="language-python">def f(x):\n'
            b"    if x:\n"
            b"        return 1\n"
            b"    return 0\n"
            b"</code></pre></main></body></html>"
        )
        _title, text, _urls = extract_structured_text(html, base_url="https://example.test/")
        self.assertIn("```python", text)
        self.assertIn("    if x:", text)
        self.assertIn("        return 1", text)

    def test_table_rows_serialized_pipe_delimited(self) -> None:
        html = (
            b"<html><body><main>"
            b"<table><tr><th>Arch</th><th>Supported</th></tr>"
            b"<tr><td>sm_86</td><td>yes</td></tr></table>"
            b"</main></body></html>"
        )
        _title, text, _urls = extract_structured_text(html, base_url="https://example.test/")
        self.assertIn("Arch | Supported", text)
        self.assertIn("sm_86 | yes", text)

    def test_inline_code_keeps_backticks_outside_fenced_blocks(self) -> None:
        html = b"<html><body><main><p>Call <code>foo(bar)</code> now.</p></main></body></html>"
        _title, text, _urls = extract_structured_text(html, base_url="https://example.test/")
        self.assertIn("`foo(bar)`", text)

    def test_no_double_counting_of_code_inside_pre(self) -> None:
        """Regression guard: inline <code> handling runs after <pre> extraction,
        so a <code> tag nested inside <pre> must not also get separately
        backtick-wrapped once its <pre> ancestor has already been replaced."""
        html = b"<html><body><main><pre><code>raw_block()</code></pre></main></body></html>"
        _title, text, _urls = extract_structured_text(html, base_url="https://example.test/")
        self.assertEqual(text.count("raw_block()"), 1)
        self.assertIn("```", text)
        self.assertNotIn("`raw_block()`", text)  # not backtick-wrapped a second time

    def test_relative_and_fragment_links_resolved_and_deduped(self) -> None:
        html = (
            b'<html><body><main>'
            b'<a href="/next">n</a><a href="/next#anchor">n2</a>'
            b'<a href="mailto:x@example.com">mail</a>'
            b"</main></body></html>"
        )
        _title, text, urls = extract_structured_text(html, base_url="https://docs.example.test/guide/")
        self.assertEqual(urls, ("https://docs.example.test/next",))

    def test_title_falls_back_to_hostname_when_missing(self) -> None:
        html = b"<html><body><main><p>no title</p></main></body></html>"
        title, _text, _urls = extract_structured_text(html, base_url="https://docs.example.test/x")
        self.assertEqual(title, "docs.example.test")

    def test_empty_page_produces_empty_text_not_a_crash(self) -> None:
        html = b"<html><body><main></main></body></html>"
        _title, text, _urls = extract_structured_text(html, base_url="https://example.test/")
        self.assertEqual(text, "")
