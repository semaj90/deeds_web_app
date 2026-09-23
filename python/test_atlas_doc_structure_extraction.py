"""Tests for extract_structured_text (parent-atlas-versioned-doc-intelligence, DOC-04).

Real HTML fixtures (no network) exercising heading/code-block/table/inline-code
preservation -- the gap the pre-DOC-04 fetch_beautifulsoup() had, where
main.get_text("\n", strip=True) flattened everything into unstructured prose,
losing exactly the structure DOC-05's chunk-level codeBlocks/apiSignatures need.
"""

from __future__ import annotations

import unittest

from atlas_external_docs import _heading_sections, chunk_document, extract_code_blocks_and_signatures, extract_structured_text


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


def _page(body: str) -> bytes:
    return f"<html><body><main><h1>T</h1>{body}</main></body></html>".encode("utf-8")


def _fenced_code(text: str) -> str:
    blocks, _signatures = extract_code_blocks_and_signatures(text)
    assert len(blocks) == 1, blocks
    return blocks[0]["code"]


class CodeTokenFidelityTests(unittest.TestCase):
    """Regression guard: styling spans inside one logical source line must not introduce artificial newlines
    (the pre-fix extractor used get_text("\\n"), splitting `hnsw.iterative_scan` into three lines)."""

    def test_github_token_spans_stay_one_identifier(self) -> None:
        html = _page('<pre><code><span>hnsw</span><span>.</span><span>iterative_scan</span></code></pre>')
        _t, text, _u = extract_structured_text(html, base_url="https://example.test/")
        self.assertEqual(_fenced_code(text), "hnsw.iterative_scan")

    def test_assignment_statement_stays_one_logical_line(self) -> None:
        html = _page(
            '<div class="highlight highlight-source-sql"><pre>'
            '<span class="pl-k">SET</span> <span class="pl-k">LOCAL</span> <span>hnsw</span>.<span>iterative_scan</span> '
            '<span class="pl-k">=</span> relaxed_order;</pre></div>'
        )
        _t, text, _u = extract_structured_text(html, base_url="https://example.test/")
        self.assertEqual(_fenced_code(text), "SET LOCAL hnsw.iterative_scan = relaxed_order;")

    def test_github_highlight_source_language_is_the_language_not_the_word_source(self) -> None:
        html = _page('<div class="highlight highlight-source-sql"><pre><span>SELECT 1;</span></pre></div>')
        _t, text, _u = extract_structured_text(html, base_url="https://example.test/")
        self.assertIn("```sql\n", text)
        self.assertNotIn("```source", text)

    def test_python_indentation_is_preserved_byte_for_byte_across_spans(self) -> None:
        source = "def f(x):\n    if x:\n        return <1>\n    return 0"
        html = _page(
            '<pre><code class="language-python"><span>def</span> <span>f</span>(x):\n'
            '    <span>if</span> x:\n        <span>return</span> &lt;1&gt;\n    <span>return</span> 0</code></pre>'
        )
        _t, text, _u = extract_structured_text(html, base_url="https://example.test/")
        self.assertEqual(_fenced_code(text), source)
        self.assertIn("```python", text)

    def test_real_source_newlines_remain_separate_lines(self) -> None:
        html = _page("<pre><code><span>first_line()</span>\n<span>second_line()</span></code></pre>")
        _t, text, _u = extract_structured_text(html, base_url="https://example.test/")
        self.assertEqual(_fenced_code(text).split("\n"), ["first_line()", "second_line()"])

    def test_br_and_per_line_elements_without_newline_text_become_lines(self) -> None:
        html = _page(
            '<pre><code><span class="line"><span>a</span><span>.</span><span>b</span></span>'
            '<span class="line"><span>c()</span></span></code></pre>'
            '<pre><code>x<br>y</code></pre>'
        )
        _t, text, _u = extract_structured_text(html, base_url="https://example.test/")
        blocks, _s = extract_code_blocks_and_signatures(text)
        self.assertEqual([b["code"] for b in blocks], ["a.b\nc()", "x\ny"])

    def test_shiki_style_lines_with_newline_text_do_not_gain_blank_lines(self) -> None:
        html = _page('<pre><code><span class="line"><span>a</span></span>\n<span class="line"><span>b</span></span></code></pre>')
        _t, text, _u = extract_structured_text(html, base_url="https://example.test/")
        self.assertEqual(_fenced_code(text), "a\nb")

    def test_inline_code_retains_the_exact_identifier(self) -> None:
        html = _page("<p>Set <code>hnsw.scan_mem_multiplier</code> to raise the memory budget.</p>")
        _t, text, _u = extract_structured_text(html, base_url="https://example.test/")
        self.assertIn("`hnsw.scan_mem_multiplier`", text)

    def test_inline_code_with_nested_spans_is_not_split(self) -> None:
        html = _page("<p>Use <code><span>vector</span><span>_cosine_ops</span></code> here.</p>")
        _t, text, _u = extract_structured_text(html, base_url="https://example.test/")
        self.assertIn("`vector_cosine_ops`", text)

    def test_exact_api_identifiers_survive_into_chunks_and_signature_extraction(self) -> None:
        html = _page(
            "<pre><code><span>SET</span> <span>hnsw</span>.<span>iterative_scan</span> = <span>strict_order</span>;</code></pre>"
            "<p>Also <code>hnsw.scan_mem_multiplier</code>; index with "
            "<code>halfvec_cosine_ops</code> or <code>vector_cosine_ops</code>.</p>"
        )
        _t, text, _u = extract_structured_text(html, base_url="https://example.test/")
        chunks = chunk_document(source_id="s", source_revision="r", source_url="https://example.test/", title="T", text=text)
        joined = "\n".join(chunk.text for chunk in chunks)
        for identifier in ("hnsw.iterative_scan", "hnsw.scan_mem_multiplier", "halfvec_cosine_ops", "vector_cosine_ops"):
            self.assertIn(identifier, joined)
        block_code = [block["code"] for chunk in chunks for block in chunk.code_blocks]
        self.assertIn("SET hnsw.iterative_scan = strict_order;", block_code)
