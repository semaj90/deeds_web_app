Uh oh!
There was an error while loading.
Please reload this page
.
google
/
langextract
Public
Notifications
You must be signed in to change notification settings
Fork
2.7k
Star
38.5k
Code
Issues
80
Pull requests
55
Discussions
Actions
Projects
Security and quality
0
Insights
Additional navigation options
Code
Issues
Pull requests
Discussions
Actions
Projects
Security and quality
Insights
Releases: google/langextract
Releases
Tags
Releases · google/langextract
Release list
v1.6.0
v1.5.0
v1.4.0
v1.3.0
v1.2.1
v1.2.0
v1.1.1
v1.1.0
v1.0.9
v1.0.8
Previous
Next
Jump to release
v1.6.0
v1.5.0
v1.4.0
v1.3.0
v1.2.1
v1.2.0
v1.1.1
v1.1.0
v1.0.9
v1.0.8
Previous
Next
v1.6.0
v1.6.0
Latest
Latest
Compare
Choose a tag to compare
Sorry, something went wrong.
Filter
Loading
Sorry, something went wrong.
Uh oh!
There was an error while loading.
Please reload this page
.
No results found
View all tags
aksg87
released this
02 Jul 06:23
v1.6.0
62a2576
This commit was created on GitHub.com and signed with GitHub’s
verified signature
.
GPG key ID:
B5690EEEBB952194
Verified
Learn about vigilant mode
.
Highlights
Add user-provided
output_schema
support for Gemini and OpenAI.
Add Ollama GPT-OSS JSON chat support.
Full Changelog
:
v1.5.0...v1.6.0
Assets
2
Loading
Uh oh!
There was an error while loading.
Please reload this page
.
All reactions
v1.5.0
v1.5.0
Compare
Choose a tag to compare
Sorry, something went wrong.
Filter
Loading
Sorry, something went wrong.
Uh oh!
There was an error while loading.
Please reload this page
.
No results found
View all tags
aksg87
released this
20 May 03:17
v1.5.0
116c0aa
This commit was created on GitHub.com and signed with GitHub’s
verified signature
.
GPG key ID:
B5690EEEBB952194
Verified
Learn about vigilant mode
.
Highlights
Add OpenAI Batch API support.
Update the default Gemini Flash model to
gemini-3.5-flash
.
Full Changelog
:
v1.4.0...v1.5.0
Assets
2
Loading
Uh oh!
There was an error while loading.
Please reload this page
.
👍
7
AminMemariani, sps014, egoan82, TheNarratorVIMMXX, swimaerta, assentfbga, and couplesbhjn reacted with thumbs up emoji
😄
4
swimaerta, assentfbga, mindedbgha, and couplesbhjn reacted with laugh emoji
🎉
4
swimaerta, assentfbga, mindedbgha, and couplesbhjn reacted with hooray emoji
❤️
3
swimaerta, assentfbga, and couplesbhjn reacted with heart emoji
🚀
4
swimaerta, assentfbga, mindedbgha, and couplesbhjn reacted with rocket emoji
👀
4
swimaerta, assentfbga, mindedbgha, and couplesbhjn reacted with eyes emoji
All reactions
👍
7 reactions
😄
4 reactions
🎉
4 reactions
❤️
3 reactions
🚀
4 reactions
👀
4 reactions
8 people reacted
v1.4.0
v1.4.0
Compare
Choose a tag to compare
Sorry, something went wrong.
Filter
Loading
Sorry, something went wrong.
Uh oh!
There was an error while loading.
Please reload this page
.
No results found
View all tags
aksg87
released this
15 May 07:28
v1.4.0
6422c1e
This commit was created on GitHub.com and signed with GitHub’s
verified signature
.
GPG key ID:
B5690EEEBB952194
Verified
Learn about vigilant mode
.
Highlights
Add OpenAI structured output schema support.
Fix Ollama compatibility for newer thinking-capable models.
Apply
additional_context
consistently for
Document
inputs.
Full Changelog
:
v1.3.0...v1.4.0
Assets
2
Loading
Uh oh!
There was an error while loading.
Please reload this page
.
👍
5
swimaerta, assentfbga, mindedbgha, couplesbhjn, and xita2 reacted with thumbs up emoji
😄
4
swimaerta, assentfbga, mindedbgha, and couplesbhjn reacted with laugh emoji
🎉
4
swimaerta, assentfbga, mindedbgha, and couplesbhjn reacted with hooray emoji
❤️
10
rosspeili, MeteAvci, RyukR1, yuandongyc, BLWTF, kuxx12257, amanelixir, assentfbga, mindedbgha, and couplesbhjn reacted with heart emoji
🚀
4
swimaerta, assentfbga, mindedbgha, and couplesbhjn reacted with rocket emoji
👀
3
swimaerta, assentfbga, and couplesbhjn reacted with eyes emoji
All reactions
👍
5 reactions
😄
4 reactions
🎉
4 reactions
❤️
10 reactions
🚀
4 reactions
👀
3 reactions
12 people reacted
v1.3.0
v1.3.0
Compare
Choose a tag to compare
Sorry, something went wrong.
Filter
Loading
Sorry, something went wrong.
Uh oh!
There was an error while loading.
Please reload this page
.
No results found
View all tags
aksg87
released this
29 Apr 02:13
v1.3.0
074cb64
What's New
Features
Add automatic retry logic for transient Gemini API errors (503, 429) with jittered exponential backoff and keyword-only retry knobs (
#385
, fixes
#240
)
Security
Make URL fetching opt-in by default (
#449
). URLs in input text are no longer auto-fetched; pass an explicit flag to enable.
Performance
Replace difflib fuzzy aligner with an O(n·m²) LCS DP for significantly faster alignment on large extractions (
#442
)
Bug Fixes
Close progress bars cleanly when save/download fails (
#434
)
Make
IssueKind
public and export it in
__all__
(
#426
)
Documentation
Note that
output_name
is not sanitized in
save_annotated_documents
(
#451
)
Add
langextract-usage
Agent Skill (
#448
)
Full Changelog
:
v1.2.1...v1.3.0
Assets
2
Loading
Uh oh!
There was an error while loading.
Please reload this page
.
👍
4
ifemejerichard, egoan82, Rainismer, and Luca-py reacted with thumbs up emoji
❤️
3
Rainismer, jadchahoud-tech, and yuandongyc reacted with heart emoji
All reactions
👍
4 reactions
❤️
3 reactions
6 people reacted
v1.2.1
v1.2.1
Compare
Choose a tag to compare
Sorry, something went wrong.
Filter
Loading
Sorry, something went wrong.
Uh oh!
There was an error while loading.
Please reload this page
.
No results found
View all tags
aksg87
released this
08 Apr 00:00
v1.2.1
9cd220c
What's New
Bug Fixes
Pass
reasoning_effort
directly to OpenAI API as a top-level Chat Completions parameter (
#429
)
Fixes
unexpected keyword argument 'reasoning'
error when using reasoning models (o1, o3, o4-mini, gpt-5)
Suppress schema errors in
resolve()
when
suppress_parse_errors=True
(
#435
)
Extends suppression to
ValueError
from malformed-but-parseable LLM output, not just
FormatError
Fix Ollama Docker example healthcheck (
#360
)
Replaces
curl
(not present in image) with
ollama list
Full Changelog
:
v1.2.0...v1.2.1
Assets
2
Loading
Uh oh!
There was an error while loading.
Please reload this page
.
👍
8
egoan82, BeWater799, vTrxn, ccorgz, alvarezpongo, aidevcni, claudecode77, and HenryWesonga reacted with thumbs up emoji
❤️
3
aukaheng, Salman007788, and MatheusCoutinho26 reacted with heart emoji
All reactions
👍
8 reactions
❤️
3 reactions
11 people reacted
v1.2.0
v1.2.0
Compare
Choose a tag to compare
Sorry, something went wrong.
Filter
Loading
Sorry, something went wrong.
Uh oh!
There was an error while loading.
Please reload this page
.
No results found
View all tags
aksg87
released this
22 Mar 22:11
v1.2.0
fb874f5
What's New
Features
Cross-chunk context awareness for coreference resolution (
#306
)
Resolves pronouns and references across chunk boundaries (e.g., "She" → "Dr. Sarah Johnson")
New
context_window_chars
parameter on
extract()
Bug Fixes
Load builtin providers before resolution regardless of config path (
#419
)
Fixes
InferenceConfigError
when specifying provider by name via
ModelConfig(provider='ollama')
Graceful handling of chunks with no extractable entities (
#423
)
suppress_parse_errors
now defaults to
True
in
extract()
so one unparseable chunk does not fail the entire document
Sanitizes suppress-parse-error log path to exclude raw chunk text
Send
keep_alive
at top level for Ollama API (
#421
)
Support Enum/dataclass values in GCS batch cache hashing (
#359
)
Handle non-Gemini model output parsing edge cases (
#300
)
Documentation
Clarify that ungrounded extractions have
char_interval=None
(
#420
)
Clarify best practices for few-shot examples (
#302
)
Full Changelog
:
v1.1.1...v1.2.0
Assets
2
Loading
Uh oh!
There was an error while loading.
Please reload this page
.
🚀
8
vhurryharry, egoan82, RC-CHN, mozhuanzuojing, Aman12x, odinhg, RustyAlgorithm44, and chib30333 reacted with rocket emoji
All reactions
🚀
8 reactions
8 people reacted
v1.1.1
v1.1.1
Compare
Choose a tag to compare
Sorry, something went wrong.
Filter
Loading
Sorry, something went wrong.
Uh oh!
There was an error while loading.
Please reload this page
.
No results found
View all tags
aksg87
released this
27 Nov 04:49
v1.1.1
afc7fd9
This commit was created on GitHub.com and signed with GitHub’s
verified signature
.
GPG key ID:
B5690EEEBB952194
Verified
Learn about vigilant mode
.
What's New
Improvements
Multi-language tokenizer support with Unicode & Regex (
#284
)
Significantly improves support for CJK (Chinese, Japanese, Korean) languages
Better handling of non-Latin scripts
Bug Fixes
Fix Gemini Batch API project parameter passing (
#286
)
Resolves "Required parameter: project" error when using Vertex AI
Full Changelog
:
v1.1.0...v1.1.1
Assets
2
Loading
Uh oh!
There was an error while loading.
Please reload this page
.
👍
16
via007, vvanglro, turtleqiu, kasper0406, disjohndoe, Genarito, egoan82, swimaerta, assentfbga, mindedbgha, and 6 more reacted with thumbs up emoji
🚀
10
jamesallain, scdenney, swimaerta, assentfbga, couplesbhjn, dados924, Art5546, jupi2142, 651961, and qzxcdfj reacted with rocket emoji
All reactions
👍
16 reactions
🚀
10 reactions
21 people reacted
v1.1.0
v1.1.0
Compare
Choose a tag to compare
Sorry, something went wrong.
Filter
Loading
Sorry, something went wrong.
Uh oh!
There was an error while loading.
Please reload this page
.
No results found
View all tags
aksg87
released this
14 Nov 22:21
v1.1.0
22ac025
What's New
Features
Vertex AI Batch API Support (
#279
)
Cost-effective processing with automatic chunking, GCS caching, and fault tolerance
Automatic fallback to standard online prediction if batch job fails
FormatHandler and schema validation framework (
#239
)
Independent progress bar control (
show_progress
) (
#227
)
Zenodo DOI support (
#218
)
Alignment parameter support via
resolver_params
(
#211
)
Community Providers:
Outlines (
#250
)
vLLM (
#244
)
llama-cpp-python (
#202
)
Improvements
Streamlined annotation layer with lazy streaming (
#276
)
Diverse text type benchmark with tokenization quality metrics (
#272
)
Enable
suppress_parse_errors
parameter in
resolver_params
(
#261
)
Resolve pylint naming convention warnings in provider modules (
#273
)
Full Changelog
:
v1.0.9...v1.1.0
Assets
2
Loading
Uh oh!
There was an error while loading.
Please reload this page
.
👍
6
egoan82, vvanglro, 0xlebogang, swimaerta, assentfbga, and mindedbgha reacted with thumbs up emoji
All reactions
👍
6 reactions
6 people reacted
v1.0.9
v1.0.9
Compare
Choose a tag to compare
Sorry, something went wrong.
Filter
Loading
Sorry, something went wrong.
Uh oh!
There was an error while loading.
Please reload this page
.
No results found
View all tags
aksg87
released this
31 Aug 19:50
v1.0.9
2446bbe
What's New
Features
Prompt alignment validation for few-shot examples (
#215
)
Validates that example extractions exist in their source text
Three modes: OFF, WARNING (default), ERROR
New parameters:
prompt_validation_level
and
prompt_validation_strict
Vertex AI authentication support for Gemini provider (
#60
)
llama-cpp-python community provider added (
#202
)
Improvements
Changed
debug=False
as default in
extract()
for cleaner output
Fixed router typings for provider plugins (
#190
)
Allow T-prefixed TypeVars in pylint (
#194
)
Full Changelog
:
v1.0.8...v1.0.9
Assets
2
Loading
Uh oh!
There was an error while loading.
Please reload this page
.
👍
9
PACHAKUTlQ, turtleqiu, gerritcloete, kasper0406, egoan82, 0xjason126, brunovercelli, firengate, and TimiEweoba reacted with thumbs up emoji
🚀
5
jamesallain, luoduyu, brunovercelli, firengate, and 213771507034 reacted with rocket emoji
All reactions
👍
9 reactions
🚀
5 reactions
12 people reacted
v1.0.8
v1.0.8
Compare
Choose a tag to compare
Sorry, something went wrong.
Filter
Loading
Sorry, something went wrong.
Uh oh!
There was an error while loading.
Please reload this page
.
No results found
View all tags
aksg87
released this
15 Aug 07:19
v1.0.8
803fe68
What's Changed
Features
Ollama timeout improvements (
#154
)
Increased default timeout from 30s to 120s
Made timeout configurable via ModelConfig
Fixed kwargs not being passed through
Documentation
Improved visualization examples for Jupyter/Colab (
#153
)
Added Romeo & Juliet Colab notebook
Full Changelog
:
v1.0.7...v1.0.8
Assets
2
Loading
Uh oh!
There was an error while loading.
Please reload this page
.
👍
16
KalyanKS-NLP, Tuhin-thinks, egoan82, andylassiter, tarun7r, PACHAKUTlQ, jahidhasanwi, nclgbd, ISHAAN10082, followingell, and 6 more reacted with thumbs up emoji
All reactions
👍
16 reactions
16 people reacted
Previous
1
2
Next
Previous
Next