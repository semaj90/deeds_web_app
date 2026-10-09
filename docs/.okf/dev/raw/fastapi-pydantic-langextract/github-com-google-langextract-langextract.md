[Skip to content](https://github.com/google/langextract#start-of-content)

You signed in with another tab or window. [Reload](https://github.com/google/langextract) to refresh your session.You signed out in another tab or window. [Reload](https://github.com/google/langextract) to refresh your session.You switched accounts on another tab or window. [Reload](https://github.com/google/langextract) to refresh your session.Dismiss alert

{{ message }}

main

[**78** Branches](https://github.com/google/langextract/branches) [**19** Tags](https://github.com/google/langextract/tags)

[Go to Branches page](https://github.com/google/langextract/branches)[Go to Tags page](https://github.com/google/langextract/tags)

Go to file

Code

Open more actions menu

## Latest commit

[![aksg87](https://avatars.githubusercontent.com/u/19271735?v=4&size=40)](https://github.com/aksg87)[aksg87](https://github.com/google/langextract/commits?author=aksg87)

[Prepare v1.7.1 release (](https://github.com/google/langextract/commit/24298305d6998061fadd01080def4288c653d243) [#554](https://github.com/google/langextract/pull/554) [)](https://github.com/google/langextract/commit/24298305d6998061fadd01080def4288c653d243)

success

2 days agoOct 6, 2026

[2429830](https://github.com/google/langextract/commit/24298305d6998061fadd01080def4288c653d243) · 2 days agoOct 6, 2026

## History

[187 Commits](https://github.com/google/langextract/commits/main/)

Open commit details

[View commit history for this file.](https://github.com/google/langextract/commits/main/) 187 Commits

## Folders and files

| Name | Name | Last commit message | Last commit date |
| --- | --- | --- | --- |
| [.github](https://github.com/google/langextract/tree/main/.github ".github") | [.github](https://github.com/google/langextract/tree/main/.github ".github") | [Harden fork live tests and dispatch from main (](https://github.com/google/langextract/commit/6ecfd897133ce5bce56727ce1dcb524d23ff3c94 "Harden fork live tests and dispatch from main (#552)") [#552](https://github.com/google/langextract/pull/552) [)](https://github.com/google/langextract/commit/6ecfd897133ce5bce56727ce1dcb524d23ff3c94 "Harden fork live tests and dispatch from main (#552)") | 3 days agoOct 5, 2026 |
| [benchmarks](https://github.com/google/langextract/tree/main/benchmarks "benchmarks") | [benchmarks](https://github.com/google/langextract/tree/main/benchmarks "benchmarks") | [perf: replace difflib fuzzy aligner with O(n\*m^2) LCS DP (](https://github.com/google/langextract/commit/8c86bf6fa3d2c0b1196409e36218a2de1b84f860 "perf: replace difflib fuzzy aligner with O(n*m^2) LCS DP (#442)  Replace the legacy fuzzy aligner with an O(n*m^2) time, O(m^2) memory LCS DP gated by coverage and density rules, where n is source length and m is extraction length (typically 3-8 tokens). The old path enumerated candidate windows and scored each with difflib, which scales badly on long documents.  Speedup: 1,000-token sources drop from ~33s to under 5ms; 5,000-token sources from ~69min (est.) to under 20ms.  Addresses #386. Related: #188.") [#442](https://github.com/google/langextract/pull/442) [)](https://github.com/google/langextract/commit/8c86bf6fa3d2c0b1196409e36218a2de1b84f860 "perf: replace difflib fuzzy aligner with O(n*m^2) LCS DP (#442)  Replace the legacy fuzzy aligner with an O(n*m^2) time, O(m^2) memory LCS DP gated by coverage and density rules, where n is source length and m is extraction length (typically 3-8 tokens). The old path enumerated candidate windows and scored each with difflib, which scales badly on long documents.  Speedup: 1,000-token sources drop from ~33s to under 5ms; 5,000-token sources from ~69min (est.) to under 20ms.  Addresses #386. Related: #188.") | 6 months agoApr 14, 2026 |
| [docs](https://github.com/google/langextract/tree/main/docs "docs") | [docs](https://github.com/google/langextract/tree/main/docs "docs") | [Fix Vertex batch live tests (](https://github.com/google/langextract/commit/2b3668be8382b6491d247816b6fdc7ad680791e8 "Fix Vertex batch live tests (#538)") [#538](https://github.com/google/langextract/pull/538) [)](https://github.com/google/langextract/commit/2b3668be8382b6491d247816b6fdc7ad680791e8 "Fix Vertex batch live tests (#538)") | last monthSep 13, 2026 |
| [examples](https://github.com/google/langextract/tree/main/examples "examples") | [examples](https://github.com/google/langextract/tree/main/examples "examples") | [Update default Gemini model to 3.5 Flash (](https://github.com/google/langextract/commit/fc7a23b17dc006561ee091357adf225a21d393ac "Update default Gemini model to 3.5 Flash (#472)") [#472](https://github.com/google/langextract/pull/472) [)](https://github.com/google/langextract/commit/fc7a23b17dc006561ee091357adf225a21d393ac "Update default Gemini model to 3.5 Flash (#472)") | 5 months agoMay 19, 2026 |
| [langextract](https://github.com/google/langextract/tree/main/langextract "langextract") | [langextract](https://github.com/google/langextract/tree/main/langextract "langextract") | [Fix Vertex batch import failure for default google\_search tool (](https://github.com/google/langextract/commit/57afdcb22727077399d14cba1ece05bde84a35cd "Fix Vertex batch import failure for default google_search tool (#561)") [#561](https://github.com/google/langextract/pull/561) [)](https://github.com/google/langextract/commit/57afdcb22727077399d14cba1ece05bde84a35cd "Fix Vertex batch import failure for default google_search tool (#561)") | 2 days agoOct 6, 2026 |
| [scripts](https://github.com/google/langextract/tree/main/scripts "scripts") | [scripts](https://github.com/google/langextract/tree/main/scripts "scripts") | [Fix provider plugin generation (](https://github.com/google/langextract/commit/3130e41b2f7ff05fbf68b48965999c7d41093036 "Fix provider plugin generation (#513)") [#513](https://github.com/google/langextract/pull/513) [)](https://github.com/google/langextract/commit/3130e41b2f7ff05fbf68b48965999c7d41093036 "Fix provider plugin generation (#513)") | 2 months agoAug 11, 2026 |
| [skills/langextract-usage](https://github.com/google/langextract/tree/main/skills/langextract-usage "This path skips through empty directories") | [skills/langextract-usage](https://github.com/google/langextract/tree/main/skills/langextract-usage "This path skips through empty directories") | [Route OpenAI reasoning and GPT-3.5 models (](https://github.com/google/langextract/commit/97d749775e0f6b1e4991351a4efe057bf484b2a2 "Route OpenAI reasoning and GPT-3.5 models (#494)") [#494](https://github.com/google/langextract/pull/494) [)](https://github.com/google/langextract/commit/97d749775e0f6b1e4991351a4efe057bf484b2a2 "Route OpenAI reasoning and GPT-3.5 models (#494)") | last monthSep 12, 2026 |
| [tests](https://github.com/google/langextract/tree/main/tests "tests") | [tests](https://github.com/google/langextract/tree/main/tests "tests") | [Fix Vertex batch import failure for default google\_search tool (](https://github.com/google/langextract/commit/57afdcb22727077399d14cba1ece05bde84a35cd "Fix Vertex batch import failure for default google_search tool (#561)") [#561](https://github.com/google/langextract/pull/561) [)](https://github.com/google/langextract/commit/57afdcb22727077399d14cba1ece05bde84a35cd "Fix Vertex batch import failure for default google_search tool (#561)") | 2 days agoOct 6, 2026 |
| [.gitignore](https://github.com/google/langextract/blob/main/.gitignore ".gitignore") | [.gitignore](https://github.com/google/langextract/blob/main/.gitignore ".gitignore") | [refactor: Multi-language tokenizer support (Unicode & Regex) (](https://github.com/google/langextract/commit/0c1af879cc9bc18817faad8a541247d76c14e931 "refactor: Multi-language tokenizer support (Unicode & Regex) (#284)  * refactor: Implement multi-language tokenizer support  - Introduce  for UAX #29 compliant segmentation. - Refactor  for better performance and consistency. - Add  abstract base class. - Update , , and  modules to use the new tokenizer API. - Add  dependency for advanced Unicode support. - Optimize memory usage with  and .  * test: Add comprehensive tokenizer tests and update benchmarks  - Add tests for `UnicodeTokenizer` and `RegexTokenizer` parity. - Add tests for sentence splitting and punctuation handling. - Update benchmark suite for tokenizer performance comparison. - Update existing tests to align with new tokenizer API.  * docs: Add Japanese extraction example  - Add  demonstrating  usage. - Provide full pipeline example with entity extraction from Japanese text.  * fix: Resolve lint errors in tokenizer and tests") [#284](https://github.com/google/langextract/pull/284) [)](https://github.com/google/langextract/commit/0c1af879cc9bc18817faad8a541247d76c14e931 "refactor: Multi-language tokenizer support (Unicode & Regex) (#284)  * refactor: Implement multi-language tokenizer support  - Introduce  for UAX #29 compliant segmentation. - Refactor  for better performance and consistency. - Add  abstract base class. - Update , , and  modules to use the new tokenizer API. - Add  dependency for advanced Unicode support. - Optimize memory usage with  and .  * test: Add comprehensive tokenizer tests and update benchmarks  - Add tests for `UnicodeTokenizer` and `RegexTokenizer` parity. - Add tests for sentence splitting and punctuation handling. - Update benchmark suite for tokenizer performance comparison. - Update existing tests to align with new tokenizer API.  * docs: Add Japanese extraction example  - Add  demonstrating  usage. - Provide full pipeline example with entity extraction from Japanese text.  * fix: Resolve lint errors in tokenizer and tests") | 11 months agoNov 20, 2025 |
| [.pre-commit-config.yaml](https://github.com/google/langextract/blob/main/.pre-commit-config.yaml ".pre-commit-config.yaml") | [.pre-commit-config.yaml](https://github.com/google/langextract/blob/main/.pre-commit-config.yaml ".pre-commit-config.yaml") | [ci: unify formatter tool pins across PR checks (](https://github.com/google/langextract/commit/895da6e8f5b12cf6800b1f149d08399df540ac7e "ci: unify formatter tool pins across PR checks (#457)") [#457](https://github.com/google/langextract/pull/457) [)](https://github.com/google/langextract/commit/895da6e8f5b12cf6800b1f149d08399df540ac7e "ci: unify formatter tool pins across PR checks (#457)") | 6 months agoApr 21, 2026 |
| [.pylintrc](https://github.com/google/langextract/blob/main/.pylintrc ".pylintrc") | [.pylintrc](https://github.com/google/langextract/blob/main/.pylintrc ".pylintrc") | [feat: Add cross-chunk context awareness for coreference resolution (](https://github.com/google/langextract/commit/3638fe4054de9fb81adadefd04d3979e7479b655 "feat: Add cross-chunk context awareness for coreference resolution (#306)  Add context_window_chars parameter that passes trailing text from the previous chunk as context, helping resolve cross-chunk coreferences.") [#306](https://github.com/google/langextract/pull/306) | 10 months agoDec 29, 2025 |
| [CITATION.cff](https://github.com/google/langextract/blob/main/CITATION.cff "CITATION.cff") | [CITATION.cff](https://github.com/google/langextract/blob/main/CITATION.cff "CITATION.cff") | [Prepare v1.7.1 release (](https://github.com/google/langextract/commit/24298305d6998061fadd01080def4288c653d243 "Prepare v1.7.1 release (#554)") [#554](https://github.com/google/langextract/pull/554) [)](https://github.com/google/langextract/commit/24298305d6998061fadd01080def4288c653d243 "Prepare v1.7.1 release (#554)") | 2 days agoOct 6, 2026 |
| [COMMUNITY\_PROVIDERS.md](https://github.com/google/langextract/blob/main/COMMUNITY_PROVIDERS.md "COMMUNITY_PROVIDERS.md") | [COMMUNITY\_PROVIDERS.md](https://github.com/google/langextract/blob/main/COMMUNITY_PROVIDERS.md "COMMUNITY_PROVIDERS.md") | [Add Outlines to list of community providers (](https://github.com/google/langextract/commit/09757ceefc3382b2f33300c6734310c49c646013 "Add Outlines to list of community providers (#250)") [#250](https://github.com/google/langextract/pull/250) [)](https://github.com/google/langextract/commit/09757ceefc3382b2f33300c6734310c49c646013 "Add Outlines to list of community providers (#250)") | last yearSep 22, 2025 |
| [CONTRIBUTING.md](https://github.com/google/langextract/blob/main/CONTRIBUTING.md "CONTRIBUTING.md") | [CONTRIBUTING.md](https://github.com/google/langextract/blob/main/CONTRIBUTING.md "CONTRIBUTING.md") | [Harden fork live tests and dispatch from main (](https://github.com/google/langextract/commit/6ecfd897133ce5bce56727ce1dcb524d23ff3c94 "Harden fork live tests and dispatch from main (#552)") [#552](https://github.com/google/langextract/pull/552) [)](https://github.com/google/langextract/commit/6ecfd897133ce5bce56727ce1dcb524d23ff3c94 "Harden fork live tests and dispatch from main (#552)") | 3 days agoOct 5, 2026 |
| [Dockerfile](https://github.com/google/langextract/blob/main/Dockerfile "Dockerfile") | [Dockerfile](https://github.com/google/langextract/blob/main/Dockerfile "Dockerfile") | [fix: Remove LangFun and pylibmagic dependencies (v1.0.2)](https://github.com/google/langextract/commit/d00d5897c6596dff92f6825524719d2991146b5e "fix: Remove LangFun and pylibmagic dependencies (v1.0.2)  Fixes #25 - Windows installation failure due to pylibmagic build requirements  Breaking change: LangFunLanguageModel removed. Use GeminiLanguageModel or OllamaLanguageModel instead.") | last yearAug 3, 2025 |
| [LICENSE](https://github.com/google/langextract/blob/main/LICENSE "LICENSE") | [LICENSE](https://github.com/google/langextract/blob/main/LICENSE "LICENSE") | [Initial public commit for LangExtract](https://github.com/google/langextract/commit/04b72333a09de4fe25c73dae35faa2f820914b9f "Initial public commit for LangExtract") | last yearJul 15, 2025 |
| [README.md](https://github.com/google/langextract/blob/main/README.md "README.md") | [README.md](https://github.com/google/langextract/blob/main/README.md "README.md") | [Update RadExtract demo link to direct app URL (](https://github.com/google/langextract/commit/af48562dcc23c974495f7d1b98652377a3cc3ae2 "Update RadExtract demo link to direct app URL (#501)") [#501](https://github.com/google/langextract/pull/501) [)](https://github.com/google/langextract/commit/af48562dcc23c974495f7d1b98652377a3cc3ae2 "Update RadExtract demo link to direct app URL (#501)") | 3 months agoJul 25, 2026 |
| [autoformat.sh](https://github.com/google/langextract/blob/main/autoformat.sh "autoformat.sh") | [autoformat.sh](https://github.com/google/langextract/blob/main/autoformat.sh "autoformat.sh") | [ci: unify formatter tool pins across PR checks (](https://github.com/google/langextract/commit/895da6e8f5b12cf6800b1f149d08399df540ac7e "ci: unify formatter tool pins across PR checks (#457)") [#457](https://github.com/google/langextract/pull/457) [)](https://github.com/google/langextract/commit/895da6e8f5b12cf6800b1f149d08399df540ac7e "ci: unify formatter tool pins across PR checks (#457)") | 6 months agoApr 21, 2026 |
| [pyproject.toml](https://github.com/google/langextract/blob/main/pyproject.toml "pyproject.toml") | [pyproject.toml](https://github.com/google/langextract/blob/main/pyproject.toml "pyproject.toml") | [Prepare v1.7.1 release (](https://github.com/google/langextract/commit/24298305d6998061fadd01080def4288c653d243 "Prepare v1.7.1 release (#554)") [#554](https://github.com/google/langextract/pull/554) [)](https://github.com/google/langextract/commit/24298305d6998061fadd01080def4288c653d243 "Prepare v1.7.1 release (#554)") | 2 days agoOct 6, 2026 |
| [tox.ini](https://github.com/google/langextract/blob/main/tox.ini "tox.ini") | [tox.ini](https://github.com/google/langextract/blob/main/tox.ini "tox.ini") | [Fix provider plugin generation (](https://github.com/google/langextract/commit/3130e41b2f7ff05fbf68b48965999c7d41093036 "Fix provider plugin generation (#513)") [#513](https://github.com/google/langextract/pull/513) [)](https://github.com/google/langextract/commit/3130e41b2f7ff05fbf68b48965999c7d41093036 "Fix provider plugin generation (#513)") | 2 months agoAug 11, 2026 |
| View all files |

## Repository files navigation

[![LangExtract Logo](https://raw.githubusercontent.com/google/langextract/main/docs/_static/logo.svg)](https://github.com/google/langextract)

# LangExtract

[Permalink: LangExtract](https://github.com/google/langextract#langextract)

[![PyPI version](https://camo.githubusercontent.com/ec4faf4cff274784c4a1d3fdef978a21a911abb7bbe06e64c5283a0ad9a8afd8/68747470733a2f2f696d672e736869656c64732e696f2f707970692f762f6c616e67657874726163742e737667)](https://pypi.org/project/langextract/)[![GitHub stars](https://camo.githubusercontent.com/c47bd46dd8c1e8c5ebde9fa9b19ca9444f2536a66ac86f87c7a735039bc57750/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f73746172732f676f6f676c652f6c616e67657874726163742e7376673f7374796c653d736f6369616c266c6162656c3d53746172)](https://github.com/google/langextract)![Tests](https://github.com/google/langextract/actions/workflows/ci.yaml/badge.svg)[![DOI](https://camo.githubusercontent.com/3fe6bcea397afebfaad025f92a98f82cf4d84b5ef8a792faf660580d60b26082/68747470733a2f2f7a656e6f646f2e6f72672f62616467652f444f492f31302e353238312f7a656e6f646f2e31373031353038392e737667)](https://doi.org/10.5281/zenodo.17015089)[![Live demo](https://camo.githubusercontent.com/b5638605a1336faa31eb717282363ab9457abf66483dd624a9542b8271104640/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f25463025394625413425393725323064656d6f2d4c616e67457874726163742d79656c6c6f77)](https://google-langextract.hf.space/)

## Table of Contents

[Permalink: Table of Contents](https://github.com/google/langextract#table-of-contents)

- [Introduction](https://github.com/google/langextract#introduction)
- [Why LangExtract?](https://github.com/google/langextract#why-langextract)
- [Quick Start](https://github.com/google/langextract#quick-start)
- [Installation](https://github.com/google/langextract#installation)
- [API Key Setup for Cloud Models](https://github.com/google/langextract#api-key-setup-for-cloud-models)
- [Adding Custom Model Providers](https://github.com/google/langextract#adding-custom-model-providers)
- [Using OpenAI Models](https://github.com/google/langextract#using-openai-models)
- [Using Local LLMs with Ollama](https://github.com/google/langextract#using-local-llms-with-ollama)
- [More Examples](https://github.com/google/langextract#more-examples)
  - [_Romeo and Juliet_ Full Text Extraction](https://github.com/google/langextract#romeo-and-juliet-full-text-extraction)
  - [Medication Extraction](https://github.com/google/langextract#medication-extraction)
  - [Radiology Report Structuring: RadExtract](https://github.com/google/langextract#radiology-report-structuring-radextract)
- [Community Providers](https://github.com/google/langextract#community-providers)
- [Contributing](https://github.com/google/langextract#contributing)
- [Testing](https://github.com/google/langextract#testing)
- [How to Cite](https://github.com/google/langextract#how-to-cite)
- [Disclaimer](https://github.com/google/langextract#disclaimer)

## Introduction

[Permalink: Introduction](https://github.com/google/langextract#introduction)

LangExtract is a Python library that uses LLMs to extract structured information from unstructured text documents based on user-defined instructions. It processes materials such as clinical notes or reports, identifying and organizing key details while ensuring the extracted data corresponds to the source text.

![LangExtract end to end: unstructured text is chunked, extracted in parallel by an LLM, and every extracted value is grounded back to its exact character span in the source](https://raw.githubusercontent.com/google/langextract/main/docs/_static/langextract_concept.gif)

**[Try the live demo →](https://google-langextract.hf.space/)**

Run grounded extraction on _Romeo and Juliet_ in your browser, no install required.

## Why LangExtract?

[Permalink: Why LangExtract?](https://github.com/google/langextract#why-langextract)

1. **Precise Source Grounding:** Maps every extraction to its exact location in the source text, enabling visual highlighting for easy traceability and verification.
2. **Reliable Structured Outputs:** Enforces a consistent output schema based on your few-shot examples, leveraging controlled generation in supported models like Gemini to guarantee robust, structured results.
3. **Optimized for Long Documents:** Overcomes the "needle-in-a-haystack" challenge of large document extraction by using an optimized strategy of text chunking, parallel processing, and multiple passes for higher recall.
4. **Interactive Visualization:** Instantly generates a self-contained, interactive HTML file to visualize and review thousands of extracted entities in their original context.
5. **Flexible LLM Support:** Supports your preferred models, from cloud-based LLMs like the Google Gemini family to local open-source models via the built-in Ollama interface.
6. **Adaptable to Any Domain:** Define extraction tasks for any domain using just a few examples. LangExtract adapts to your needs without requiring any model fine-tuning.
7. **Leverages LLM World Knowledge:** Utilize precise prompt wording and few-shot examples to influence how the extraction task may utilize LLM knowledge. The accuracy of any inferred information and its adherence to the task specification are contingent upon the selected LLM, the complexity of the task, the clarity of the prompt instructions, and the nature of the prompt examples.

## Quick Start

[Permalink: Quick Start](https://github.com/google/langextract#quick-start)

> **Note:** Using cloud-hosted models like Gemini requires an API key. See the [API Key Setup](https://github.com/google/langextract#api-key-setup-for-cloud-models) section for instructions on how to get and configure your key.

Extract structured information with just a few lines of code.

### 1\. Define Your Extraction Task

[Permalink: 1. Define Your Extraction Task](https://github.com/google/langextract#1-define-your-extraction-task)

First, create a prompt that clearly describes what you want to extract. Then, provide a high-quality example to guide the model.

```
import langextract as lx
import textwrap

# 1. Define the prompt and extraction rules
prompt = textwrap.dedent("""\
    Extract characters, emotions, and relationships in order of appearance.
    Use exact text for extractions. Do not paraphrase or overlap entities.
    Provide meaningful attributes for each entity to add context.""")

# 2. Provide a high-quality example to guide the model
examples = [\
    lx.data.ExampleData(\
        text="ROMEO. But soft! What light through yonder window breaks? It is the east, and Juliet is the sun.",\
        extractions=[\
            lx.data.Extraction(\
                extraction_class="character",\
                extraction_text="ROMEO",\
                attributes={"emotional_state": "wonder"}\
            ),\
            lx.data.Extraction(\
                extraction_class="emotion",\
                extraction_text="But soft!",\
                attributes={"feeling": "gentle awe"}\
            ),\
            lx.data.Extraction(\
                extraction_class="relationship",\
                extraction_text="Juliet is the sun",\
                attributes={"type": "metaphor"}\
            ),\
        ]\
    )\
]
```

> **Note:** Examples drive model behavior. Each `extraction_text` should ideally be verbatim from the example's `text` (no paraphrasing), listed in order of appearance. LangExtract raises `Prompt alignment` warnings by default if examples don't follow this pattern—resolve these for best results.
>
> **Grounding:** LLMs may occasionally extract content from few-shot examples rather than the input text. LangExtract automatically detects this: extractions that cannot be located in the source text will have `char_interval = None`. Filter these out with `[e for e in result.extractions if e.char_interval]` to keep only grounded results.

### 2\. Run the Extraction

[Permalink: 2. Run the Extraction](https://github.com/google/langextract#2-run-the-extraction)

Provide your input text and the prompt materials to the `lx.extract` function.

```
# The input text to be processed
input_text = "Lady Juliet gazed longingly at the stars, her heart aching for Romeo"

# Run the extraction
result = lx.extract(
    text_or_documents=input_text,
    prompt_description=prompt,
    examples=examples,
    model_id="gemini-3.5-flash",
)
```

For advanced constraints beyond examples, such as enum values on extraction
attributes, Gemini and OpenAI support `output_schema` with or without
few-shot examples. See
[Custom output schemas](https://github.com/google/langextract/blob/main/docs/examples/output_schema.md).

> **Model Selection**: `gemini-3.5-flash` is the recommended default, offering strong extraction quality for LangExtract's schema-constrained workflows. For high-volume or cost-sensitive workloads, consider the current stable Flash-Lite model, `gemini-3.1-flash-lite`; for highly complex tasks requiring deeper reasoning, evaluate a current Gemini Pro model from the official model documentation. For large-scale or production use, a paid Gemini tier is suggested to increase throughput and avoid rate limits. See the [rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits#usage-tiers) for details.
>
> **Model Lifecycle**: Note that Gemini models have a lifecycle with defined retirement dates. Users should consult the [official model version documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions) to stay informed about the latest stable and legacy versions.

### 3\. Visualize the Results

[Permalink: 3. Visualize the Results](https://github.com/google/langextract#3-visualize-the-results)

The extractions can be saved to a `.jsonl` file, a popular format for working with language model data. LangExtract can then generate an interactive HTML visualization from this file to review the entities in context.

```
# Save the results to a JSONL file
lx.io.save_annotated_documents([result], output_name="extraction_results.jsonl", output_dir=".")

# Generate the visualization from the file
html_content = lx.visualize("extraction_results.jsonl")
with open("visualization.html", "w") as f:
    if hasattr(html_content, 'data'):
        f.write(html_content.data)  # For Jupyter/Colab
    else:
        f.write(html_content)
```

This creates an animated and interactive HTML file:

![Romeo and Juliet Basic Visualization ](https://raw.githubusercontent.com/google/langextract/main/docs/_static/romeo_juliet_basic.gif)![Romeo and Juliet Basic Visualization ](https://raw.githubusercontent.com/google/langextract/main/docs/_static/romeo_juliet_basic.gif)[Open Romeo and Juliet Basic Visualization  in new window](https://raw.githubusercontent.com/google/langextract/main/docs/_static/romeo_juliet_basic.gif)

> **Note on LLM Knowledge Utilization:** This example demonstrates extractions that stay close to the text evidence - extracting "longing" for Lady Juliet's emotional state and identifying "yearning" from "gazed longingly at the stars." The task could be modified to generate attributes that draw more heavily from the LLM's world knowledge (e.g., adding `"identity": "Capulet family daughter"` or `"literary_context": "tragic heroine"`). The balance between text-evidence and knowledge-inference is controlled by your prompt instructions and example attributes.

### Scaling to Longer Documents

[Permalink: Scaling to Longer Documents](https://github.com/google/langextract#scaling-to-longer-documents)

For larger texts, you can process entire documents directly from URLs with parallel processing and enhanced sensitivity:

```
# Process Romeo & Juliet directly from Project Gutenberg
result = lx.extract(
    text_or_documents="https://www.gutenberg.org/files/1513/1513-0.txt",
    prompt_description=prompt,
    examples=examples,
    model_id="gemini-3.5-flash",
    extraction_passes=3,    # Improves recall through multiple passes
    max_workers=20,         # Parallel processing for speed
    max_char_buffer=1000    # Smaller contexts for better accuracy
)
```

This approach can extract hundreds of entities from full novels while maintaining high accuracy. The interactive visualization seamlessly handles large result sets, making it easy to explore hundreds of entities from the output JSONL file. **[See the full _Romeo and Juliet_ extraction example →](https://github.com/google/langextract/blob/main/docs/examples/longer_text_example.md)** for detailed results and performance insights.

### Vertex AI Batch Processing

[Permalink: Vertex AI Batch Processing](https://github.com/google/langextract#vertex-ai-batch-processing)

Save costs on large-scale tasks by enabling Vertex AI Batch API with
`language_model_params` that include `vertexai=True`, `project`, `location`,
and a `batch` config.

See an example of the Vertex AI Batch API usage in [this example](https://github.com/google/langextract/blob/main/docs/examples/batch_api_example.md).

## Installation

[Permalink: Installation](https://github.com/google/langextract#installation)

### From PyPI

[Permalink: From PyPI](https://github.com/google/langextract#from-pypi)

```
pip install langextract
```

_Recommended for most users. For isolated environments, consider using a virtual environment:_

```
python -m venv langextract_env
source langextract_env/bin/activate  # On Windows: langextract_env\Scripts\activate
pip install langextract
```

### From Source

[Permalink: From Source](https://github.com/google/langextract#from-source)

LangExtract uses modern Python packaging with `pyproject.toml` for dependency management:

_Installing with `-e` puts the package in development mode, allowing you to modify the code without reinstalling._

```
git clone https://github.com/google/langextract.git
cd langextract

# For basic installation:
pip install -e .

# For development (includes linting tools):
pip install -e ".[dev]"

# For testing (includes pytest):
pip install -e ".[test]"
```

### Docker

[Permalink: Docker](https://github.com/google/langextract#docker)

```
docker build -t langextract .
docker run --rm -e LANGEXTRACT_API_KEY="your-api-key" langextract python your_script.py
```

## API Key Setup for Cloud Models

[Permalink: API Key Setup for Cloud Models](https://github.com/google/langextract#api-key-setup-for-cloud-models)

When using LangExtract with cloud-hosted models (like Gemini or OpenAI), you'll need to
set up an API key. On-device models don't require an API key. For developers
using local LLMs, LangExtract offers built-in support for Ollama and can be
extended to other third-party APIs by updating the inference endpoints.

### API Key Sources

[Permalink: API Key Sources](https://github.com/google/langextract#api-key-sources)

Get API keys from:

- [AI Studio](https://aistudio.google.com/app/apikey) for Gemini models
- [Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/docs/sdks/overview) for enterprise use
- [OpenAI Platform](https://platform.openai.com/api-keys) for OpenAI models

### Setting up API key in your environment

[Permalink: Setting up API key in your environment](https://github.com/google/langextract#setting-up-api-key-in-your-environment)

**Option 1: Environment Variable**

```
export LANGEXTRACT_API_KEY="your-api-key-here"
```

**Option 2: .env File (Recommended)**

Add your API key to a `.env` file:

```
# Add API key to .env file
cat >> .env << 'EOF'
LANGEXTRACT_API_KEY=your-api-key-here
EOF

# Keep your API key secure
echo '.env' >> .gitignore
```

In your Python code:

```
import langextract as lx

result = lx.extract(
    text_or_documents=input_text,
    prompt_description="Extract information...",
    examples=[...],
    model_id="gemini-3.5-flash"
)
```

**Option 3: Direct API Key (Not Recommended for Production)**

You can also provide the API key directly in your code, though this is not recommended for production use:

```
result = lx.extract(
    text_or_documents=input_text,
    prompt_description="Extract information...",
    examples=[...],
    model_id="gemini-3.5-flash",
    api_key="your-api-key-here"  # Only use this for testing/development
)
```

**Option 4: Vertex AI (Service Accounts)**

Use [Vertex AI](https://cloud.google.com/vertex-ai/docs/start/introduction-unified-platform) for authentication with service accounts:

```
result = lx.extract(
    text_or_documents=input_text,
    prompt_description="Extract information...",
    examples=[...],
    model_id="gemini-3.5-flash",
    language_model_params={
        "vertexai": True,
        "project": "your-project-id",
        "location": "global"  # or regional endpoint
    }
)
```

## Adding Custom Model Providers

[Permalink: Adding Custom Model Providers](https://github.com/google/langextract#adding-custom-model-providers)

LangExtract supports custom LLM providers via a lightweight plugin system. You can add support for new models without changing core code.

- Add new model support independently of the core library
- Distribute your provider as a separate Python package
- Keep custom dependencies isolated
- Override or extend built-in providers via priority-based resolution

See the detailed guide in [Provider System Documentation](https://github.com/google/langextract/blob/main/langextract/providers/README.md) to learn how to:

- Register a provider with `@router.register(...)` from `langextract.providers`
- Publish an entry point for discovery
- Optionally provide a schema with `get_schema_class()` for structured output
- Integrate with the factory via `create_model(...)`

## Using OpenAI Models

[Permalink: Using OpenAI Models](https://github.com/google/langextract#using-openai-models)

LangExtract supports OpenAI models (requires optional dependency: `pip install langextract[openai]`):

```
import langextract as lx

# OPENAI_API_KEY in the environment is picked up automatically; pass
# api_key=... explicitly only if you need to override it.
result = lx.extract(
    text_or_documents=input_text,
    prompt_description=prompt,
    examples=examples,
    model_id="gpt-4o",  # Automatically selects OpenAI provider
)
```

The OpenAI provider uses structured outputs or JSON mode and auto-determines
fence behavior — leave `fence_output` and `use_schema_constraints` unset.
`output_schema` is also supported for OpenAI models that support structured
outputs; provide a LangExtract output-envelope JSON schema, preferably with the
`lx.schema` helpers.

For large, non-latency-sensitive OpenAI workloads, enable the OpenAI Batch API
with `language_model_params`. Batch mode is opt-in and falls back to realtime
calls when the prompt count is below the configured threshold.

```
result = lx.extract(
    text_or_documents=documents,
    prompt_description=prompt,
    examples=examples,
    model_id="gpt-4o-mini",
    language_model_params={
        "batch": {
            "enabled": True,
            "threshold": 50,
            "poll_interval": 10,
        }
    },
)
```

For OpenAI-compatible endpoints or non-GPT model IDs (which skip auto-routing), use `ModelConfig` with an explicit provider:

```
from langextract.factory import ModelConfig

result = lx.extract(
    text_or_documents=input_text,
    prompt_description=prompt,
    examples=examples,
    config=ModelConfig(
        model_id="my-openai-compatible-model",
        provider="openai",
        provider_kwargs={"api_key": "sk-...", "base_url": "https://..."},
    ),
)
```

## Using Local LLMs with Ollama

[Permalink: Using Local LLMs with Ollama](https://github.com/google/langextract#using-local-llms-with-ollama)

LangExtract supports local inference using Ollama, allowing you to run models without API keys:

```
import langextract as lx

result = lx.extract(
    text_or_documents=input_text,
    prompt_description=prompt,
    examples=examples,
    model_id="gemma2:2b",  # Automatically selects Ollama provider
    model_url="http://localhost:11434",
)
```

The Ollama provider exposes `FormatModeSchema` for JSON mode. Leave `fence_output`
and `use_schema_constraints` unset so the factory auto-configures from the provider's
schema. Ollama does not currently support `output_schema`.

**Quick setup:** Install Ollama from [ollama.com](https://ollama.com/), run `ollama pull gemma2:2b`, then `ollama serve`.

For detailed installation, Docker setup, and examples, see [`examples/ollama/`](https://github.com/google/langextract/blob/main/examples/ollama).

## More Examples

[Permalink: More Examples](https://github.com/google/langextract#more-examples)

Additional examples of LangExtract in action:

### _Romeo and Juliet_ Full Text Extraction

[Permalink: Romeo and Juliet Full Text Extraction](https://github.com/google/langextract#romeo-and-juliet-full-text-extraction)

LangExtract can process complete documents directly from URLs. This example demonstrates extraction from the full text of _Romeo and Juliet_ from Project Gutenberg (147,843 characters), showing parallel processing, sequential extraction passes, and performance optimization for long document processing.

**[View _Romeo and Juliet_ Full Text Example →](https://github.com/google/langextract/blob/main/docs/examples/longer_text_example.md)**

### Medication Extraction

[Permalink: Medication Extraction](https://github.com/google/langextract#medication-extraction)

> **Disclaimer:** This demonstration is for illustrative purposes of LangExtract's baseline capability only. It does not represent a finished or approved product, is not intended to diagnose or suggest treatment of any disease or condition, and should not be used for medical advice.

LangExtract excels at extracting structured medical information from clinical text. These examples demonstrate both basic entity recognition (medication names, dosages, routes) and relationship extraction (connecting medications to their attributes), showing LangExtract's effectiveness for healthcare applications.

**[View Medication Examples →](https://github.com/google/langextract/blob/main/docs/examples/medication_examples.md)**

### Radiology Report Structuring: RadExtract

[Permalink: Radiology Report Structuring: RadExtract](https://github.com/google/langextract#radiology-report-structuring-radextract)

Explore RadExtract, a live interactive demo on HuggingFace Spaces that shows how LangExtract can automatically structure radiology reports. Try it directly in your browser with no setup required.

**[View RadExtract Demo →](https://google-radextract.hf.space/)**

## Community Providers

[Permalink: Community Providers](https://github.com/google/langextract#community-providers)

Extend LangExtract with custom model providers! Check out our [Community Provider Plugins](https://github.com/google/langextract/blob/main/COMMUNITY_PROVIDERS.md) registry to discover providers created by the community or add your own.

For detailed instructions on creating a provider plugin, see the [Custom Provider Plugin Example](https://github.com/google/langextract/blob/main/examples/custom_provider_plugin).

## Contributing

[Permalink: Contributing](https://github.com/google/langextract#contributing)

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/google/langextract/blob/main/CONTRIBUTING.md) to get started
with development, testing, and pull requests. You must sign a
[Contributor License Agreement](https://cla.developers.google.com/about)
before submitting patches.

Thanks to everyone who has [contributed](https://github.com/google/langextract/graphs/contributors).

## Testing

[Permalink: Testing](https://github.com/google/langextract#testing)

To run tests locally from the source:

```
# Clone the repository
git clone https://github.com/google/langextract.git
cd langextract

# Install with test dependencies
pip install -e ".[test]"

# Run all tests
pytest tests
```

Or reproduce the full CI matrix locally with tox:

```
tox  # runs pylint + pytest on Python 3.10 and 3.11
```

### Ollama Integration Testing

[Permalink: Ollama Integration Testing](https://github.com/google/langextract#ollama-integration-testing)

If you have Ollama installed locally, you can run integration tests:

```
# Test Ollama integration (requires Ollama running with gemma2:2b model)
tox -e ollama-integration
```

This test will automatically detect if Ollama is available and run real inference tests.

## Development

[Permalink: Development](https://github.com/google/langextract#development)

### Code Formatting

[Permalink: Code Formatting](https://github.com/google/langextract#code-formatting)

This project uses automated formatting tools to maintain consistent code style:

```
# Auto-format all code
./autoformat.sh

# Or run formatters separately
isort langextract tests --profile google --line-length 80
pyink langextract tests --config pyproject.toml
```

### Pre-commit Hooks

[Permalink: Pre-commit Hooks](https://github.com/google/langextract#pre-commit-hooks)

For automatic formatting checks:

```
pre-commit install  # One-time setup
pre-commit run --all-files  # Manual run
```

### Linting

[Permalink: Linting](https://github.com/google/langextract#linting)

Run linting before submitting PRs:

```
pylint --rcfile=.pylintrc langextract tests
```

See [CONTRIBUTING.md](https://github.com/google/langextract/blob/main/CONTRIBUTING.md) for full development guidelines.

## How to Cite

[Permalink: How to Cite](https://github.com/google/langextract#how-to-cite)

If you use LangExtract in your research, please cite it:

```
@software{goel_langextract,
  author  = {Goel, Akshay},
  title   = {{LangExtract}},
  year    = {2026},
  version = {1.6.0},
  doi     = {10.5281/zenodo.21126643},
  url     = {https://github.com/google/langextract}
}
```

Cite the version you used — each release has its own DOI on
[Zenodo](https://doi.org/10.5281/zenodo.17015089). If your style rejects
`@software`, use `@misc`.

## Disclaimer

[Permalink: Disclaimer](https://github.com/google/langextract#disclaimer)

This is not an officially supported Google product. If you use
LangExtract in production or publications, please cite accordingly and
acknowledge usage. Use is subject to the [Apache 2.0 License](https://github.com/google/langextract/blob/main/LICENSE).
For health-related applications, use of LangExtract is also subject to the
[Health AI Developer Foundations Terms of Use](https://developers.google.com/health-ai-developer-foundations/terms).

* * *

**Happy Extracting!**

## About

A Python library for extracting structured information from unstructured text using LLMs with precise source grounding and interactive visualization.

[pypi.org/project/langextract/](https://pypi.org/project/langextract/)

### Topics

[gemini](https://github.com/topics/gemini) [gemini-ai](https://github.com/topics/gemini-ai) [gemini-api](https://github.com/topics/gemini-api) [gemini-flash](https://github.com/topics/gemini-flash) [gemini-pro](https://github.com/topics/gemini-pro) [information-extration](https://github.com/topics/information-extration) [large-language-models](https://github.com/topics/large-language-models) [llm](https://github.com/topics/llm) [nlp](https://github.com/topics/nlp) [python](https://github.com/topics/python) [structured-data](https://github.com/topics/structured-data)

### Resources

[Readme](https://github.com/google/langextract#readme-ov-file)

[Apache-2.0 license](https://github.com/google/langextract#Apache-2.0-1-ov-file)

### Code of conduct

[Code of conduct](https://github.com/google/langextract#coc-ov-file)

### Contributing

[Contributing](https://github.com/google/langextract#contributing-ov-file)

### Security policy

[Security policy](https://github.com/google/langextract#security-ov-file)

Cite this repository

[Activity](https://github.com/google/langextract/activity)

[Custom properties](https://github.com/google/langextract/custom-properties)

### Stars

**38.9k** stars

### Watchers

**172** watching

### Forks

[**2.7k** forks](https://github.com/google/langextract/forks)

[Report repository](https://github.com/contact/report-content?content_url=https%3A%2F%2Fgithub.com%2Fgoogle%2Flangextract&report=google+%28user%29)

## Releases

## Used by

## Contributors

## Languages

You can’t perform that action at this time.