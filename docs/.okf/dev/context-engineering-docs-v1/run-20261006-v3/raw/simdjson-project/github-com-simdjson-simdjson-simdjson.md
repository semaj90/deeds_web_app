[Skip to content](https://github.com/simdjson/simdjson#start-of-content)

You signed in with another tab or window. [Reload](https://github.com/simdjson/simdjson) to refresh your session.You signed out in another tab or window. [Reload](https://github.com/simdjson/simdjson) to refresh your session.You switched accounts on another tab or window. [Reload](https://github.com/simdjson/simdjson) to refresh your session.Dismiss alert

{{ message }}

[simdjson](https://github.com/simdjson)/ **[simdjson](https://github.com/simdjson/simdjson)** Public

- [Notifications](https://github.com/login?return_to=%2Fsimdjson%2Fsimdjson) You must be signed in to change notification settings
- [Fork\\
1.3k](https://github.com/login?return_to=%2Fsimdjson%2Fsimdjson)
- [Star\\
24.4k](https://github.com/login?return_to=%2Fsimdjson%2Fsimdjson)


master

[**69** Branches](https://github.com/simdjson/simdjson/branches) [**128** Tags](https://github.com/simdjson/simdjson/tags)

[Go to Branches page](https://github.com/simdjson/simdjson/branches)[Go to Tags page](https://github.com/simdjson/simdjson/tags)

Go to file

Code

Open more actions menu

## Latest commit

![mvanslobbe](https://avatars.githubusercontent.com/u/2647329?v=4&size=40)![Michiel van Slobbe](https://github.githubassets.com/images/gravatars/gravatar-user-420.png?size=40)

[mvanslobbe](https://github.com/simdjson/simdjson/commits?author=mvanslobbe)

and

Michiel van Slobbe

[Do not drop empty or duplicate keys in fractured\_json table rows (](https://github.com/simdjson/simdjson/commit/7fa77b1e4ba2a21c97d97adc48e4cd8b9d1e7faa) [#2908](https://github.com/simdjson/simdjson/pull/2908) [)](https://github.com/simdjson/simdjson/commit/7fa77b1e4ba2a21c97d97adc48e4cd8b9d1e7faa)

Open commit detailssuccess

yesterdayOct 5, 2026

[7fa77b1](https://github.com/simdjson/simdjson/commit/7fa77b1e4ba2a21c97d97adc48e4cd8b9d1e7faa) · yesterdayOct 5, 2026

## History

[3,336 Commits](https://github.com/simdjson/simdjson/commits/master/)

Open commit details

[View commit history for this file.](https://github.com/simdjson/simdjson/commits/master/) 3,336 Commits

## Folders and files

| Name | Name | Last commit message | Last commit date |
| --- | --- | --- | --- |
| [.github](https://github.com/simdjson/simdjson/tree/master/.github ".github") | [.github](https://github.com/simdjson/simdjson/tree/master/.github ".github") | [CI: test each pull request once, trim Windows jobs; regenerate the si…](https://github.com/simdjson/simdjson/commit/c9030726ebbf5f9fe9f9facb4a401f6d3ccd77a2 "CI: test each pull request once, trim Windows jobs; regenerate the single header for 5.0.2 (#2902)  * CI: test each pull request once, cancel superseded runs, trim Windows jobs  - Workflows that ran on every push and every pull request now run on   pushes to master and on pull requests only. A branch of this repository   with an open pull request was tested twice. All of them can also be run   by hand (workflow_dispatch). - Add a concurrency group to every workflow: a new push to a pull request   cancels its previous run. Pushes to master and scheduled runs are never   cancelled. - LoongArch64, Emscripten and Ubuntu 22.04 clang 13/14 now run on master   only (or by hand). - Windows: 30 jobs down to 19. vs18-clang-ci-cxx20.yml was an exact copy   of vs18-clang-ci.yml (same name, no C++20 flag); it is now a single   ClangCL C++20 build. RelWithDebInfo jobs are dropped, as are a few   redundant shared/static and NaN/Inf combinations.  * Regenerate the single header for 5.0.2 (include #2901)  * document_stream: make truncated_bytes() correct for json_sequence and comma_delimited  The json_sequence and comma_delimited stage-1 filters drop RS markers and root-level commas by compacting structural_indexes in place. That left a stale index in the slot past the compacted end, where stage 1 had stored the input length, and the final batch copies that slot into the bookkeeping that truncated_bytes() reads. Complete streams therefore reported spurious truncated bytes: e.g. 2 for the comma-delimited input `1,2,3`, or 3 for the json_sequence input `\x1e{\"a\":1}\n\x1e[2]\n`.  Restore the sentinel after compaction in both filters (shared by every kernel, including fallback). Truncated tails are still reported: `{\"a\":1},{\"b\":` yields 5. The extra store has no measurable cost (json_sequence and comma_delimited parse_many throughput within noise on Apple M4 and on Xeon Gold 6548N).  Update the iterate_many/parse_many docs and the document_stream headers: the value is now meaningful in every format, under the same conditions as before (iterate to the end, no document error). Add a regression test and regenerate the single header.  * Faster static-reflection serialization and deserialization  Serialization (builder): - Compute an upper bound on the output size with reflection, reserve it once,   then write through an unchecked writer (no capacity check per write). - to_json(z, std::string&) writes straight into the string with   resize_and_overwrite instead of copying out of a string_builder. - Copy keys as padded 16-byte blocks; force write_string_escaped inline and   scan 32 bytes at a time with AVX2. - Replace the integer writer with jeaiii's algorithm (two 200-byte tables).  Deserialization: - Collect vector elements in a per-thread scratch vector, then move them into   an exactly reserved vector: one allocation instead of repeated regrowth. - Parse integers eight digits at a time when they have at least eight digits.  * Fix review findings: truncated_bytes() on an unclosed string, 32-bit bound overflow, bad_alloc in the vector path  - json_sequence and comma_delimited: the stage-1 filters restored len as the   EOF sentinel, but after a discarded unclosed string stage 1 had planted the   string's start there, so truncated_bytes() returned 0. Keep the planted value. - The size bound (a sum of 6 * string sizes) can overflow a 32-bit size_t, and   the unchecked writer would then overrun the buffer: use it on 64-bit only. - Reserve before marking the scratch-vector collection complete, so that a   bad_alloc from reserve still leaves the parsed elements in out.  * Fix CI: GCC 13 stringop-overflow in string_builder::append(double), kernel-dependent test  - Restore the original body of string_builder::append(double): computing the   position from the pointer returned by write_double() made GCC 13.3 (Ubuntu   24.04, SIMDJSON_ENABLE_NAN_INF=ON) report a bogus out-of-bounds write.   write_double() is now used only by the unchecked reflection writer. - In the json_sequence truncated_bytes() test, put a space before the unclosed   string: whether a quote right after an RS is a structural depends on the   SIMD kernel, which changed the expected count (4 or 5) from one to the next.  * Regenerate the single header  * dom::parse_many: honor number_as_string(), copy only the number for root numbers  - document_stream::start() now passes number_as_string() to the parser   implementation, as parse() does: on a fresh parser, parse_many() reported   BIGINT_ERROR for integers that do not fit in 64 bits. - visit_root_number made its space-padded copy from the number to the end of   the input, which in a stream is the rest of the batch: a stream of bare   numbers was hundreds of times slower. Copy up to the next structural only.  * Regenerate the single header") | 2 days agoOct 4, 2026 |
| [.vscode](https://github.com/simdjson/simdjson/tree/master/.vscode ".vscode") | [.vscode](https://github.com/simdjson/simdjson/tree/master/.vscode ".vscode") | [let us default on developer mode when building with VScode](https://github.com/simdjson/simdjson/commit/8fff57578c15cdb9c1bf8778904335a49c1a4f0d "let us default on developer mode when building with VScode") | last yearAug 24, 2025 |
| [benchmark](https://github.com/simdjson/simdjson/tree/master/benchmark "benchmark") | [benchmark](https://github.com/simdjson/simdjson/tree/master/benchmark "benchmark") | [Add Glaze to benchmarks; deserialize strings and large container elem…](https://github.com/simdjson/simdjson/commit/d6bd354102d5331b5a21ad4b567a115d6f5728cb "Add Glaze to benchmarks; deserialize strings and large container elements in place (#2896)  * add glaze to reflection benchmarks  * add recipe book benchmark  * Deserialize strings and large container elements in place  The string deserializer built a temporary std::string and move-assigned it; it now assigns directly into the destination. Containers of large (> 32 bytes) or string-like, non-trivially-copyable elements now deserialize directly into a newly emplaced element (removed again on error or exception) instead of into a temporary that is then moved.  Small elements keep the temporary: value-initializing them in place makes GCC emit rep stos, which cost 17% on citm_catalog.  recipe_book parsing (GCC 16, static reflection):   Xeon Gold 6548N: 1042 -> 1296 MB/s (+24%), glaze 1147 MB/s   Zen 5 (EPYC 9R45): 1826 -> 1960 MB/s (+7%), glaze 1728 MB/s citm_catalog and twitter are unchanged (within noise).  * Test in-place container deserialization on error; assign u8strings in place  - Add tests for the in-place container path (std::string and a large,   non-trivially-copyable element type): on an error code or an exception,   the failed element is removed and the earlier elements are kept. The   error-code tests also run when exceptions are disabled. - Deserialize u8string-like types with assign, as for std::string.  ---------  Co-authored-by: Max Bachmann <oss@maxbachmann.de>") | 5 days agoOct 1, 2026 |
| [cmake](https://github.com/simdjson/simdjson/tree/master/cmake "cmake") | [cmake](https://github.com/simdjson/simdjson/tree/master/cmake "cmake") | [fix: LTO workaround (](https://github.com/simdjson/simdjson/commit/67f79c606fc08c0438abc36956712d43da7c8307 "fix: LTO workaround (#2818)  * LTO for toolchains others than MSVC  * remove missleading comment") [#2818](https://github.com/simdjson/simdjson/pull/2818) [)](https://github.com/simdjson/simdjson/commit/67f79c606fc08c0438abc36956712d43da7c8307 "fix: LTO workaround (#2818)  * LTO for toolchains others than MSVC  * remove missleading comment") | 2 months agoAug 11, 2026 |
| [dependencies](https://github.com/simdjson/simdjson/tree/master/dependencies "dependencies") | [dependencies](https://github.com/simdjson/simdjson/tree/master/dependencies "dependencies") | [Remove unused competition dependencies (cjson, jsmn, gason, fastjson,…](https://github.com/simdjson/simdjson/commit/a683f0a7596f78576236a88f3bb765c9ca3d368e "Remove unused competition dependencies (cjson, jsmn, gason, fastjson, ujson4c, jsoncpp) (#2862)  None of these are used in any benchmark (no SIMDJSON_COMPETITION_* use under benchmark/). They were only referenced by dependencies/CMakeLists.txt and tests/dom/allparserscheckfile.cpp.  Trim the checker to rapidjson/sajson, drop competition-all extras (kept as alias of competition-core), and remove the vendored dependencies/jsoncppdist/.  Fixes #2859.") | 3 weeks agoSep 17, 2026 |
| [doc](https://github.com/simdjson/simdjson/tree/master/doc "doc") | [doc](https://github.com/simdjson/simdjson/tree/master/doc "doc") | [README: new performance figures (twitter.json, GCC 16.2, C++26 static…](https://github.com/simdjson/simdjson/commit/d809a72c15b21f1bea31da08134e5c7f66abf836 "README: new performance figures (twitter.json, GCC 16.2, C++26 static reflection)  Replace the old Skylake/GCC 10 parsing chart with parsing and serialization charts for simdjson 5.0.2 on an Intel Xeon Gold 6548N, compared against Glaze, Serde, yyjson, RapidJSON, reflect-cpp and nlohmann::json. Light and dark variants are selected with <picture>.") | 2 days agoOct 4, 2026 |
| [examples](https://github.com/simdjson/simdjson/tree/master/examples "examples") | [examples](https://github.com/simdjson/simdjson/tree/master/examples "examples") | [Detect C++26 static reflection instead of requiring a build flag (](https://github.com/simdjson/simdjson/commit/6deddc5b73d84c9d322f735e8bab08d4abcdb27f "Detect C++26 static reflection instead of requiring a build flag (#2798)  * Detect C++26 static reflection instead of requiring a build flag  SIMDJSON_STATIC_REFLECTION defaulted to 0 in the headers, so the reflection-based APIs were reachable only by defining the macro by hand or by configuring the CMake option. Someone who dropped simdjson.h and simdjson.cpp into their project and compiled with a C++26 compiler -- the way most people consume simdjson -- got nothing.  Detect the feature set instead. Reflection needs more than the reflection operator, so the check covers all of what the code uses that has a feature-test macro:    P2996 reflection (^^, splicers, <meta>)  __cpp_impl_reflection,                                            __cpp_lib_reflection   P1306 expansion statements               __cpp_expansion_statements   P3491 define_static_string/_array        __cpp_lib_define_static  Two more features we use, annotations (P3394) and consteval blocks (P3289), have no feature-test macro of their own; GCC 16 implements both and does not advertise either. Every implementation that provides the four macros above also provides those two, and the comment in compiler_check.h records that assumption. SIMDJSON_STATIC_REFLECTION remains overridable, so a compiler that gets this wrong in either direction can still be pinned.  Being in C++26 mode is not by itself enough: compilers ask you to opt into reflection, and GCC 16 only defines __cpp_impl_reflection under -freflection. So detection turns on precisely when the user asked their compiler for reflection, which is the intended trigger.  The CMake variable becomes AUTO (new default) / ON / OFF. AUTO leaves the language mode alone and lets the headers decide; ON keeps the old behaviour of adding -std=c++26 -freflection and forcing the macro; OFF now forces the macro to 0 rather than merely not setting it. The resolved answer is exposed internally as SIMDJSON_STATIC_REFLECTION_ENABLED, which is what the test and benchmark directories now gate on -- \"AUTO\" is a true-ish string to if(), so they could not keep testing the user-facing variable.  Also stop overwriting a CMAKE_CXX_STANDARD the user set explicitly, and fix SIMDJSON_CPLUSPLUS26, whose 202402L threshold no compiler reaches (GCC 16 and Clang 21 both report 202400L in C++26 mode).  tests/reflection_autodetect_tests.cpp checks that the headers and the build system agree on the detected value and that the matching API works; a new gcc16 CI job compiles it against the amalgamation with and without -freflection, so the single-header promise is covered without a build system.  Verified with GCC 16.1 (x86-64 and arm64 containers):   - single header + -std=c++26 -freflection: reflection on, round-trip     through rename/skip annotations works, no macro and no CMake   - a libsimdjson.a built with plain defaults still serves a C++26     consumer that uses reflection   - -std=c++26 without -freflection, and C++11/17/20: reflection off,     ordinary API unaffected   - developer mode, reflection forced ON: 137/137 ctest   - developer mode, AUTO with no C++26: 131/131 ctest   - developer mode, forced OFF: 130/130 ctest   - Apple clang, AUTO: 119/119 ctest, reflection correctly not detected  * Rename the reflection CMake setting to SIMDJSON_STATIC_REFLECTION_MODE  Reusing SIMDJSON_STATIC_REFLECTION for a three-valued setting broke the performance check. The name used to be a boolean, and CMake's if() treats every string other than a short list (empty, 0, OFF, NO, FALSE, N, IGNORE, NOTFOUND, *-NOTFOUND) as true -- AUTO included.  That matters because cmake/simdjson-user-cmakecache.cmake copies every SIMDJSON_* cache entry into the reference build that benchmark/dom/checkperf.cmake configures against master. Master still writes `if(SIMDJSON_STATIC_REFLECTION)` and, seeing the string AUTO, added -std=c++26 -freflection to a GCC 13 build:      c++: error: unrecognized command-line option '-freflection'     c++: error: unrecognized command-line option '-std=c++26'  Any project that vendors an older simdjson, or that still tests the variable the documented way, would have hit the same thing. So put the three-valued setting under a new name and leave the old one boolean. The old spelling is still accepted, mapped to ON/OFF, with a deprecation message.  The preprocessor macro SIMDJSON_STATIC_REFLECTION keeps its name and meaning; only the CMake variable moved.  Also initialize `value` in reflection_autodetect_tests.cpp. GCC cannot see that get() leaves it untouched exactly on the path that returns early, so -Wmaybe-uninitialized fired and the no-exceptions and no-threads builds compile with -Werror.  Checked by handing the filtered user cache to a master checkout the way checkperf does: with the old name it configures master with -freflection -std=c++26, with the new one it configures clean. Full suite passes (119/119).  * simplifying doc  * some cleaning.  * need to allow ==") [#2798](https://github.com/simdjson/simdjson/pull/2798) [)](https://github.com/simdjson/simdjson/commit/6deddc5b73d84c9d322f735e8bab08d4abcdb27f "Detect C++26 static reflection instead of requiring a build flag (#2798)  * Detect C++26 static reflection instead of requiring a build flag  SIMDJSON_STATIC_REFLECTION defaulted to 0 in the headers, so the reflection-based APIs were reachable only by defining the macro by hand or by configuring the CMake option. Someone who dropped simdjson.h and simdjson.cpp into their project and compiled with a C++26 compiler -- the way most people consume simdjson -- got nothing.  Detect the feature set instead. Reflection needs more than the reflection operator, so the check covers all of what the code uses that has a feature-test macro:    P2996 reflection (^^, splicers, <meta>)  __cpp_impl_reflection,                                            __cpp_lib_reflection   P1306 expansion statements               __cpp_expansion_statements   P3491 define_static_string/_array        __cpp_lib_define_static  Two more features we use, annotations (P3394) and consteval blocks (P3289), have no feature-test macro of their own; GCC 16 implements both and does not advertise either. Every implementation that provides the four macros above also provides those two, and the comment in compiler_check.h records that assumption. SIMDJSON_STATIC_REFLECTION remains overridable, so a compiler that gets this wrong in either direction can still be pinned.  Being in C++26 mode is not by itself enough: compilers ask you to opt into reflection, and GCC 16 only defines __cpp_impl_reflection under -freflection. So detection turns on precisely when the user asked their compiler for reflection, which is the intended trigger.  The CMake variable becomes AUTO (new default) / ON / OFF. AUTO leaves the language mode alone and lets the headers decide; ON keeps the old behaviour of adding -std=c++26 -freflection and forcing the macro; OFF now forces the macro to 0 rather than merely not setting it. The resolved answer is exposed internally as SIMDJSON_STATIC_REFLECTION_ENABLED, which is what the test and benchmark directories now gate on -- \"AUTO\" is a true-ish string to if(), so they could not keep testing the user-facing variable.  Also stop overwriting a CMAKE_CXX_STANDARD the user set explicitly, and fix SIMDJSON_CPLUSPLUS26, whose 202402L threshold no compiler reaches (GCC 16 and Clang 21 both report 202400L in C++26 mode).  tests/reflection_autodetect_tests.cpp checks that the headers and the build system agree on the detected value and that the matching API works; a new gcc16 CI job compiles it against the amalgamation with and without -freflection, so the single-header promise is covered without a build system.  Verified with GCC 16.1 (x86-64 and arm64 containers):   - single header + -std=c++26 -freflection: reflection on, round-trip     through rename/skip annotations works, no macro and no CMake   - a libsimdjson.a built with plain defaults still serves a C++26     consumer that uses reflection   - -std=c++26 without -freflection, and C++11/17/20: reflection off,     ordinary API unaffected   - developer mode, reflection forced ON: 137/137 ctest   - developer mode, AUTO with no C++26: 131/131 ctest   - developer mode, forced OFF: 130/130 ctest   - Apple clang, AUTO: 119/119 ctest, reflection correctly not detected  * Rename the reflection CMake setting to SIMDJSON_STATIC_REFLECTION_MODE  Reusing SIMDJSON_STATIC_REFLECTION for a three-valued setting broke the performance check. The name used to be a boolean, and CMake's if() treats every string other than a short list (empty, 0, OFF, NO, FALSE, N, IGNORE, NOTFOUND, *-NOTFOUND) as true -- AUTO included.  That matters because cmake/simdjson-user-cmakecache.cmake copies every SIMDJSON_* cache entry into the reference build that benchmark/dom/checkperf.cmake configures against master. Master still writes `if(SIMDJSON_STATIC_REFLECTION)` and, seeing the string AUTO, added -std=c++26 -freflection to a GCC 13 build:      c++: error: unrecognized command-line option '-freflection'     c++: error: unrecognized command-line option '-std=c++26'  Any project that vendors an older simdjson, or that still tests the variable the documented way, would have hit the same thing. So put the three-valued setting under a new name and leave the old one boolean. The old spelling is still accepted, mapped to ON/OFF, with a deprecation message.  The preprocessor macro SIMDJSON_STATIC_REFLECTION keeps its name and meaning; only the CMake variable moved.  Also initialize `value` in reflection_autodetect_tests.cpp. GCC cannot see that get() leaves it untouched exactly on the path that returns early, so -Wmaybe-uninitialized fired and the no-exceptions and no-threads builds compile with -Werror.  Checked by handing the filtered user cache to a master checkout the way checkperf does: with the old name it configures master with -freflection -std=c++26, with the new one it configures clean. Full suite passes (119/119).  * simplifying doc  * some cleaning.  * need to allow ==") | 2 months agoAug 4, 2026 |
| [extra](https://github.com/simdjson/simdjson/tree/master/extra "extra") | [extra](https://github.com/simdjson/simdjson/tree/master/extra "extra") | [Removing all stdout, stderr from main library. (](https://github.com/simdjson/simdjson/commit/80b4dd2e8ac76f447a688452ef1c1103453b1d55 "Removing all stdout, stderr from main library. (#455)  * Removing all stdout,stderr from main library.") [#455](https://github.com/simdjson/simdjson/pull/455) [)](https://github.com/simdjson/simdjson/commit/80b4dd2e8ac76f447a688452ef1c1103453b1d55 "Removing all stdout, stderr from main library. (#455)  * Removing all stdout,stderr from main library.") | 7 years agoJan 20, 2020 |
| [fuzz](https://github.com/simdjson/simdjson/tree/master/fuzz "fuzz") | [fuzz](https://github.com/simdjson/simdjson/tree/master/fuzz "fuzz") | [Add a JSONPath fuzz target (](https://github.com/simdjson/simdjson/commit/1e30d1e61898e73dcc98ce2a0732c9a175c2440a "Add a JSONPath fuzz target (#2837)  There was a fuzzer for JSON Pointer (fuzz_atpointer) but none for JSONPath (at_path(), at_path_with_wildcard()). at_path_with_wildcard() routes through get_next_key_and_json_path(), which let a std::out_of_range escape a noexcept caller until #2801 fixed one input shape. at_path() takes a separate, equally untested path through json_path_to_pointer_conversion().  Add fuzz/fuzz_atpath.cpp, mirroring fuzz_atpointer.cpp's input-split convention. Covers both DOM and On-Demand at_path()/wildcard entry points, touching the resolved values instead of just confirming they were reached. No try/catch: every call here is noexcept, so an escaping exception means std::terminate() first anyway -- that's the finding this is meant to surface.  Ran under libFuzzer with ASan/UBSan for ~7.6M executions, seeded with adversarial bracket-quote and wildcard inputs. No crashes found.  Closes #368") [#2837](https://github.com/simdjson/simdjson/pull/2837) [)](https://github.com/simdjson/simdjson/commit/1e30d1e61898e73dcc98ce2a0732c9a175c2440a "Add a JSONPath fuzz target (#2837)  There was a fuzzer for JSON Pointer (fuzz_atpointer) but none for JSONPath (at_path(), at_path_with_wildcard()). at_path_with_wildcard() routes through get_next_key_and_json_path(), which let a std::out_of_range escape a noexcept caller until #2801 fixed one input shape. at_path() takes a separate, equally untested path through json_path_to_pointer_conversion().  Add fuzz/fuzz_atpath.cpp, mirroring fuzz_atpointer.cpp's input-split convention. Covers both DOM and On-Demand at_path()/wildcard entry points, touching the resolved values instead of just confirming they were reached. No try/catch: every call here is noexcept, so an escaping exception means std::terminate() first anyway -- that's the finding this is meant to surface.  Ran under libFuzzer with ASan/UBSan for ~7.6M executions, seeded with adversarial bracket-quote and wildcard inputs. No crashes found.  Closes #368") | 2 months agoAug 24, 2026 |
| [images](https://github.com/simdjson/simdjson/tree/master/images "images") | [images](https://github.com/simdjson/simdjson/tree/master/images "images") | [adjust logo image file names (\*\_simdjason\_\* -> \*\_simdjson\_\*) (](https://github.com/simdjson/simdjson/commit/835bdba123d9743ed297be65c7c95e8964743514 "adjust logo image file names (*_simdjason_* -> *_simdjson_*) (#2569)") [#2569](https://github.com/simdjson/simdjson/pull/2569) [)](https://github.com/simdjson/simdjson/commit/835bdba123d9743ed297be65c7c95e8964743514 "adjust logo image file names (*_simdjason_* -> *_simdjson_*) (#2569)") | 10 months agoDec 20, 2025 |
| [include](https://github.com/simdjson/simdjson/tree/master/include "include") | [include](https://github.com/simdjson/simdjson/tree/master/include "include") | [Do not drop empty or duplicate keys in fractured\_json table rows (](https://github.com/simdjson/simdjson/commit/7fa77b1e4ba2a21c97d97adc48e4cd8b9d1e7faa "Do not drop empty or duplicate keys in fractured_json table rows (#2908)  When fractured_json lays out an array of objects as a table, it can lose keys. With default options:      fractured_json_string(R\"([[{\"\":1}]])\")         // [ [ {1} ] ]     fractured_json_string(R\"([[{\"a\":1,\"a\":2}]])\")  // [ [ {\"a\": 1} ] ]  The first output is not valid JSON. The table code used an empty table_column::key to mean \"array row\", so a column for the valid key \"\" was written without its key and colon. Mark object columns with an explicit has_key flag instead.  The second output silently loses \"a\":2. A table column holds one value per row, so later duplicates of a key had nowhere to go. Duplicate names are valid JSON (RFC 8259 only says they SHOULD be unique), and the DOM, minify() and prettify() keep them. When a row has a duplicate key, do not lay out the array as a table or as aligned compact rows, so the regular formatter writes every member. Duplicates are detected by recording the last row that filled each column, which adds no hashing or per-row allocation.  Add regression tests for both cases.  Co-authored-by: Michiel van Slobbe <michiel.van.slobbe@gmail.com>") [#2908](https://github.com/simdjson/simdjson/pull/2908) [)](https://github.com/simdjson/simdjson/commit/7fa77b1e4ba2a21c97d97adc48e4cd8b9d1e7faa "Do not drop empty or duplicate keys in fractured_json table rows (#2908)  When fractured_json lays out an array of objects as a table, it can lose keys. With default options:      fractured_json_string(R\"([[{\"\":1}]])\")         // [ [ {1} ] ]     fractured_json_string(R\"([[{\"a\":1,\"a\":2}]])\")  // [ [ {\"a\": 1} ] ]  The first output is not valid JSON. The table code used an empty table_column::key to mean \"array row\", so a column for the valid key \"\" was written without its key and colon. Mark object columns with an explicit has_key flag instead.  The second output silently loses \"a\":2. A table column holds one value per row, so later duplicates of a key had nowhere to go. Duplicate names are valid JSON (RFC 8259 only says they SHOULD be unique), and the DOM, minify() and prettify() keep them. When a row has a duplicate key, do not lay out the array as a table or as aligned compact rows, so the regular formatter writes every member. Duplicates are detected by recording the last row that filled each column, which adds no hashing or per-row allocation.  Add regression tests for both cases.  Co-authored-by: Michiel van Slobbe <michiel.van.slobbe@gmail.com>") | yesterdayOct 5, 2026 |
| [jsonexamples](https://github.com/simdjson/simdjson/tree/master/jsonexamples "jsonexamples") | [jsonexamples](https://github.com/simdjson/simdjson/tree/master/jsonexamples "jsonexamples") | [Add Glaze to benchmarks; deserialize strings and large container elem…](https://github.com/simdjson/simdjson/commit/d6bd354102d5331b5a21ad4b567a115d6f5728cb "Add Glaze to benchmarks; deserialize strings and large container elements in place (#2896)  * add glaze to reflection benchmarks  * add recipe book benchmark  * Deserialize strings and large container elements in place  The string deserializer built a temporary std::string and move-assigned it; it now assigns directly into the destination. Containers of large (> 32 bytes) or string-like, non-trivially-copyable elements now deserialize directly into a newly emplaced element (removed again on error or exception) instead of into a temporary that is then moved.  Small elements keep the temporary: value-initializing them in place makes GCC emit rep stos, which cost 17% on citm_catalog.  recipe_book parsing (GCC 16, static reflection):   Xeon Gold 6548N: 1042 -> 1296 MB/s (+24%), glaze 1147 MB/s   Zen 5 (EPYC 9R45): 1826 -> 1960 MB/s (+7%), glaze 1728 MB/s citm_catalog and twitter are unchanged (within noise).  * Test in-place container deserialization on error; assign u8strings in place  - Add tests for the in-place container path (std::string and a large,   non-trivially-copyable element type): on an error code or an exception,   the failed element is removed and the earlier elements are kept. The   error-code tests also run when exceptions are disabled. - Deserialize u8string-like types with assign, as for std::string.  ---------  Co-authored-by: Max Bachmann <oss@maxbachmann.de>") | 5 days agoOct 1, 2026 |
| [p2996](https://github.com/simdjson/simdjson/tree/master/p2996 "p2996") | [p2996](https://github.com/simdjson/simdjson/tree/master/p2996 "p2996") | [updating the reflection benchmarks (](https://github.com/simdjson/simdjson/commit/8c5cc8c4435a45920a4c2305c7169d558e5e51f3 "updating the reflection benchmarks (#2598)  * updating the reflection benchmarks  * removing exception during parsing.  * saving.") [#2598](https://github.com/simdjson/simdjson/pull/2598) [)](https://github.com/simdjson/simdjson/commit/8c5cc8c4435a45920a4c2305c7169d558e5e51f3 "updating the reflection benchmarks (#2598)  * updating the reflection benchmarks  * removing exception during parsing.  * saving.") | 9 months agoFeb 2, 2026 |
| [scripts](https://github.com/simdjson/simdjson/tree/master/scripts "scripts") | [scripts](https://github.com/simdjson/simdjson/tree/master/scripts "scripts") | [Remove ineffective parse skip-flag benchmarks and dead scripts (](https://github.com/simdjson/simdjson/commit/79df265b09e6b435ccf52a5a2d0cec205e8de0b7 "Remove ineffective parse skip-flag benchmarks and dead scripts (#2816)  The parse_noutf8validation, parse_nonumberparsing, and parse_nostringparsing targets only defined skip macros on the benchmark executable, not the prebuilt simdjson library, so all four binaries were hash-identical. SIMDJSON_SKIPSTRINGPARSING no longer exists, SIMDJSON_SKIPUTF8VALIDATION is a CMake option that sets SIMDJSON_UTF8VALIDATION (not a usable per-target define), and only SIMDJSON_SKIPNUMBERPARSING remains in the library sources.  Also remove scripts that depended on those targets or on competition binaries removed in #1379 (plotparse, parseandstat, parser, selectparser, parsingcompdata).  Fixes #2812") [#2816](https://github.com/simdjson/simdjson/pull/2816) [)](https://github.com/simdjson/simdjson/commit/79df265b09e6b435ccf52a5a2d0cec205e8de0b7 "Remove ineffective parse skip-flag benchmarks and dead scripts (#2816)  The parse_noutf8validation, parse_nonumberparsing, and parse_nostringparsing targets only defined skip macros on the benchmark executable, not the prebuilt simdjson library, so all four binaries were hash-identical. SIMDJSON_SKIPSTRINGPARSING no longer exists, SIMDJSON_SKIPUTF8VALIDATION is a CMake option that sets SIMDJSON_UTF8VALIDATION (not a usable per-target define), and only SIMDJSON_SKIPNUMBERPARSING remains in the library sources.  Also remove scripts that depended on those targets or on competition binaries removed in #1379 (plotparse, parseandstat, parser, selectparser, parsingcompdata).  Fixes #2812") | 2 months agoAug 7, 2026 |
| [singleheader](https://github.com/simdjson/simdjson/tree/master/singleheader "singleheader") | [singleheader](https://github.com/simdjson/simdjson/tree/master/singleheader "singleheader") | [CI: test each pull request once, trim Windows jobs; regenerate the si…](https://github.com/simdjson/simdjson/commit/c9030726ebbf5f9fe9f9facb4a401f6d3ccd77a2 "CI: test each pull request once, trim Windows jobs; regenerate the single header for 5.0.2 (#2902)  * CI: test each pull request once, cancel superseded runs, trim Windows jobs  - Workflows that ran on every push and every pull request now run on   pushes to master and on pull requests only. A branch of this repository   with an open pull request was tested twice. All of them can also be run   by hand (workflow_dispatch). - Add a concurrency group to every workflow: a new push to a pull request   cancels its previous run. Pushes to master and scheduled runs are never   cancelled. - LoongArch64, Emscripten and Ubuntu 22.04 clang 13/14 now run on master   only (or by hand). - Windows: 30 jobs down to 19. vs18-clang-ci-cxx20.yml was an exact copy   of vs18-clang-ci.yml (same name, no C++20 flag); it is now a single   ClangCL C++20 build. RelWithDebInfo jobs are dropped, as are a few   redundant shared/static and NaN/Inf combinations.  * Regenerate the single header for 5.0.2 (include #2901)  * document_stream: make truncated_bytes() correct for json_sequence and comma_delimited  The json_sequence and comma_delimited stage-1 filters drop RS markers and root-level commas by compacting structural_indexes in place. That left a stale index in the slot past the compacted end, where stage 1 had stored the input length, and the final batch copies that slot into the bookkeeping that truncated_bytes() reads. Complete streams therefore reported spurious truncated bytes: e.g. 2 for the comma-delimited input `1,2,3`, or 3 for the json_sequence input `\x1e{\"a\":1}\n\x1e[2]\n`.  Restore the sentinel after compaction in both filters (shared by every kernel, including fallback). Truncated tails are still reported: `{\"a\":1},{\"b\":` yields 5. The extra store has no measurable cost (json_sequence and comma_delimited parse_many throughput within noise on Apple M4 and on Xeon Gold 6548N).  Update the iterate_many/parse_many docs and the document_stream headers: the value is now meaningful in every format, under the same conditions as before (iterate to the end, no document error). Add a regression test and regenerate the single header.  * Faster static-reflection serialization and deserialization  Serialization (builder): - Compute an upper bound on the output size with reflection, reserve it once,   then write through an unchecked writer (no capacity check per write). - to_json(z, std::string&) writes straight into the string with   resize_and_overwrite instead of copying out of a string_builder. - Copy keys as padded 16-byte blocks; force write_string_escaped inline and   scan 32 bytes at a time with AVX2. - Replace the integer writer with jeaiii's algorithm (two 200-byte tables).  Deserialization: - Collect vector elements in a per-thread scratch vector, then move them into   an exactly reserved vector: one allocation instead of repeated regrowth. - Parse integers eight digits at a time when they have at least eight digits.  * Fix review findings: truncated_bytes() on an unclosed string, 32-bit bound overflow, bad_alloc in the vector path  - json_sequence and comma_delimited: the stage-1 filters restored len as the   EOF sentinel, but after a discarded unclosed string stage 1 had planted the   string's start there, so truncated_bytes() returned 0. Keep the planted value. - The size bound (a sum of 6 * string sizes) can overflow a 32-bit size_t, and   the unchecked writer would then overrun the buffer: use it on 64-bit only. - Reserve before marking the scratch-vector collection complete, so that a   bad_alloc from reserve still leaves the parsed elements in out.  * Fix CI: GCC 13 stringop-overflow in string_builder::append(double), kernel-dependent test  - Restore the original body of string_builder::append(double): computing the   position from the pointer returned by write_double() made GCC 13.3 (Ubuntu   24.04, SIMDJSON_ENABLE_NAN_INF=ON) report a bogus out-of-bounds write.   write_double() is now used only by the unchecked reflection writer. - In the json_sequence truncated_bytes() test, put a space before the unclosed   string: whether a quote right after an RS is a structural depends on the   SIMD kernel, which changed the expected count (4 or 5) from one to the next.  * Regenerate the single header  * dom::parse_many: honor number_as_string(), copy only the number for root numbers  - document_stream::start() now passes number_as_string() to the parser   implementation, as parse() does: on a fresh parser, parse_many() reported   BIGINT_ERROR for integers that do not fit in 64 bits. - visit_root_number made its space-padded copy from the number to the end of   the input, which in a stream is the rest of the batch: a stream of bare   numbers was hundreds of times slower. Copy up to the next structural only.  * Regenerate the single header") | 2 days agoOct 4, 2026 |
| [src](https://github.com/simdjson/simdjson/tree/master/src "src") | [src](https://github.com/simdjson/simdjson/tree/master/src "src") | [CI: test each pull request once, trim Windows jobs; regenerate the si…](https://github.com/simdjson/simdjson/commit/c9030726ebbf5f9fe9f9facb4a401f6d3ccd77a2 "CI: test each pull request once, trim Windows jobs; regenerate the single header for 5.0.2 (#2902)  * CI: test each pull request once, cancel superseded runs, trim Windows jobs  - Workflows that ran on every push and every pull request now run on   pushes to master and on pull requests only. A branch of this repository   with an open pull request was tested twice. All of them can also be run   by hand (workflow_dispatch). - Add a concurrency group to every workflow: a new push to a pull request   cancels its previous run. Pushes to master and scheduled runs are never   cancelled. - LoongArch64, Emscripten and Ubuntu 22.04 clang 13/14 now run on master   only (or by hand). - Windows: 30 jobs down to 19. vs18-clang-ci-cxx20.yml was an exact copy   of vs18-clang-ci.yml (same name, no C++20 flag); it is now a single   ClangCL C++20 build. RelWithDebInfo jobs are dropped, as are a few   redundant shared/static and NaN/Inf combinations.  * Regenerate the single header for 5.0.2 (include #2901)  * document_stream: make truncated_bytes() correct for json_sequence and comma_delimited  The json_sequence and comma_delimited stage-1 filters drop RS markers and root-level commas by compacting structural_indexes in place. That left a stale index in the slot past the compacted end, where stage 1 had stored the input length, and the final batch copies that slot into the bookkeeping that truncated_bytes() reads. Complete streams therefore reported spurious truncated bytes: e.g. 2 for the comma-delimited input `1,2,3`, or 3 for the json_sequence input `\x1e{\"a\":1}\n\x1e[2]\n`.  Restore the sentinel after compaction in both filters (shared by every kernel, including fallback). Truncated tails are still reported: `{\"a\":1},{\"b\":` yields 5. The extra store has no measurable cost (json_sequence and comma_delimited parse_many throughput within noise on Apple M4 and on Xeon Gold 6548N).  Update the iterate_many/parse_many docs and the document_stream headers: the value is now meaningful in every format, under the same conditions as before (iterate to the end, no document error). Add a regression test and regenerate the single header.  * Faster static-reflection serialization and deserialization  Serialization (builder): - Compute an upper bound on the output size with reflection, reserve it once,   then write through an unchecked writer (no capacity check per write). - to_json(z, std::string&) writes straight into the string with   resize_and_overwrite instead of copying out of a string_builder. - Copy keys as padded 16-byte blocks; force write_string_escaped inline and   scan 32 bytes at a time with AVX2. - Replace the integer writer with jeaiii's algorithm (two 200-byte tables).  Deserialization: - Collect vector elements in a per-thread scratch vector, then move them into   an exactly reserved vector: one allocation instead of repeated regrowth. - Parse integers eight digits at a time when they have at least eight digits.  * Fix review findings: truncated_bytes() on an unclosed string, 32-bit bound overflow, bad_alloc in the vector path  - json_sequence and comma_delimited: the stage-1 filters restored len as the   EOF sentinel, but after a discarded unclosed string stage 1 had planted the   string's start there, so truncated_bytes() returned 0. Keep the planted value. - The size bound (a sum of 6 * string sizes) can overflow a 32-bit size_t, and   the unchecked writer would then overrun the buffer: use it on 64-bit only. - Reserve before marking the scratch-vector collection complete, so that a   bad_alloc from reserve still leaves the parsed elements in out.  * Fix CI: GCC 13 stringop-overflow in string_builder::append(double), kernel-dependent test  - Restore the original body of string_builder::append(double): computing the   position from the pointer returned by write_double() made GCC 13.3 (Ubuntu   24.04, SIMDJSON_ENABLE_NAN_INF=ON) report a bogus out-of-bounds write.   write_double() is now used only by the unchecked reflection writer. - In the json_sequence truncated_bytes() test, put a space before the unclosed   string: whether a quote right after an RS is a structural depends on the   SIMD kernel, which changed the expected count (4 or 5) from one to the next.  * Regenerate the single header  * dom::parse_many: honor number_as_string(), copy only the number for root numbers  - document_stream::start() now passes number_as_string() to the parser   implementation, as parse() does: on a fresh parser, parse_many() reported   BIGINT_ERROR for integers that do not fit in 64 bits. - visit_root_number made its space-padded copy from the number to the end of   the input, which in a stream is the rest of the batch: a stream of bare   numbers was hundreds of times slower. Copy up to the next structural only.  * Regenerate the single header") | 2 days agoOct 4, 2026 |
| [style](https://github.com/simdjson/simdjson/tree/master/style "style") | [style](https://github.com/simdjson/simdjson/tree/master/style "style") | [Hiding the pointer away... (](https://github.com/simdjson/simdjson/commit/99a153d9e8a966809fcee8bbad492495e1eccbd9 "Hiding the pointer away... (#252)  * Hiding the runtime dispatch pointer in a source file so it is not an exported symbol * Disabling hard failure on style check. * Fixes https://github.com/lemire/simdjson/issues/250") [#252](https://github.com/simdjson/simdjson/pull/252) [)](https://github.com/simdjson/simdjson/commit/99a153d9e8a966809fcee8bbad492495e1eccbd9 "Hiding the pointer away... (#252)  * Hiding the runtime dispatch pointer in a source file so it is not an exported symbol * Disabling hard failure on style check. * Fixes https://github.com/lemire/simdjson/issues/250") | 7 years agoAug 4, 2019 |
| [tests](https://github.com/simdjson/simdjson/tree/master/tests "tests") | [tests](https://github.com/simdjson/simdjson/tree/master/tests "tests") | [Do not drop empty or duplicate keys in fractured\_json table rows (](https://github.com/simdjson/simdjson/commit/7fa77b1e4ba2a21c97d97adc48e4cd8b9d1e7faa "Do not drop empty or duplicate keys in fractured_json table rows (#2908)  When fractured_json lays out an array of objects as a table, it can lose keys. With default options:      fractured_json_string(R\"([[{\"\":1}]])\")         // [ [ {1} ] ]     fractured_json_string(R\"([[{\"a\":1,\"a\":2}]])\")  // [ [ {\"a\": 1} ] ]  The first output is not valid JSON. The table code used an empty table_column::key to mean \"array row\", so a column for the valid key \"\" was written without its key and colon. Mark object columns with an explicit has_key flag instead.  The second output silently loses \"a\":2. A table column holds one value per row, so later duplicates of a key had nowhere to go. Duplicate names are valid JSON (RFC 8259 only says they SHOULD be unique), and the DOM, minify() and prettify() keep them. When a row has a duplicate key, do not lay out the array as a table or as aligned compact rows, so the regular formatter writes every member. Duplicates are detected by recording the last row that filled each column, which adds no hashing or per-row allocation.  Add regression tests for both cases.  Co-authored-by: Michiel van Slobbe <michiel.van.slobbe@gmail.com>") [#2908](https://github.com/simdjson/simdjson/pull/2908) [)](https://github.com/simdjson/simdjson/commit/7fa77b1e4ba2a21c97d97adc48e4cd8b9d1e7faa "Do not drop empty or duplicate keys in fractured_json table rows (#2908)  When fractured_json lays out an array of objects as a table, it can lose keys. With default options:      fractured_json_string(R\"([[{\"\":1}]])\")         // [ [ {1} ] ]     fractured_json_string(R\"([[{\"a\":1,\"a\":2}]])\")  // [ [ {\"a\": 1} ] ]  The first output is not valid JSON. The table code used an empty table_column::key to mean \"array row\", so a column for the valid key \"\" was written without its key and colon. Mark object columns with an explicit has_key flag instead.  The second output silently loses \"a\":2. A table column holds one value per row, so later duplicates of a key had nowhere to go. Duplicate names are valid JSON (RFC 8259 only says they SHOULD be unique), and the DOM, minify() and prettify() keep them. When a row has a duplicate key, do not lay out the array as a table or as aligned compact rows, so the regular formatter writes every member. Duplicates are detected by recording the last row that filled each column, which adds no hashing or per-row allocation.  Add regression tests for both cases.  Co-authored-by: Michiel van Slobbe <michiel.van.slobbe@gmail.com>") | yesterdayOct 5, 2026 |
| [tools](https://github.com/simdjson/simdjson/tree/master/tools "tools") | [tools](https://github.com/simdjson/simdjson/tree/master/tools "tools") | [Add a release workflow that only releases a commit whose CI passed (](https://github.com/simdjson/simdjson/commit/8c55d8cb688bf543f6f76f1e0be7f3867442999d "Add a release workflow that only releases a commit whose CI passed (#2905)  A manually triggered workflow (patch, minor or major), modeled on CRoaring's: it bumps the version with tools/release.py (which also regenerates the single header), tests the single header, commits, tags and publishes a GitHub release with the single-header files attached.  Unlike CRoaring's, it first checks the CI of the master commit it is about to release: every check run must have completed and passed (or been skipped), and the commit status must not be failing or pending. Otherwise no release. The release is then made from that exact commit, and the push to master is not forced, so a commit pushed in the meantime makes the release fail instead of being released unchecked.  tools/release.py no longer fails when doxygen is not installed, as on the GitHub runners.") [#…](https://github.com/simdjson/simdjson/pull/2905) | 2 days agoOct 4, 2026 |
| [windows](https://github.com/simdjson/simdjson/tree/master/windows "windows") | [windows](https://github.com/simdjson/simdjson/tree/master/windows "windows") | [This adds /permissive- to recent visual studio builds (](https://github.com/simdjson/simdjson/commit/939b6b854a1ce52d89ecba967a585872404ae346 "This adds /permissive- to recent visual studio builds (#1596)  * This adds /permissive-.  * Typo.  * Trying this simple fix.") [#1596](https://github.com/simdjson/simdjson/pull/1596) [)](https://github.com/simdjson/simdjson/commit/939b6b854a1ce52d89ecba967a585872404ae346 "This adds /permissive- to recent visual studio builds (#1596)  * This adds /permissive-.  * Typo.  * Trying this simple fix.") | 5 years agoJun 1, 2021 |
| [.clang-format](https://github.com/simdjson/simdjson/blob/master/.clang-format ".clang-format") | [.clang-format](https://github.com/simdjson/simdjson/blob/master/.clang-format ".clang-format") | [We are adopting clang-format.](https://github.com/simdjson/simdjson/commit/0610ebc51426a8267188bc4cf6752b272acabd6b "We are adopting clang-format.") | 7 years agoAug 1, 2019 |
| [.clangd](https://github.com/simdjson/simdjson/blob/master/.clangd ".clangd") | [.clangd](https://github.com/simdjson/simdjson/blob/master/.clangd ".clangd") | [Make simdjson compile again](https://github.com/simdjson/simdjson/commit/ef563a4b0985feca001eac0604a5fe24dba77362 "Make simdjson compile again") | 2 years agoAug 18, 2024 |
| [.dockerignore](https://github.com/simdjson/simdjson/blob/master/.dockerignore ".dockerignore") | [.dockerignore](https://github.com/simdjson/simdjson/blob/master/.dockerignore ".dockerignore") | [move amalgamate from bash to python (](https://github.com/simdjson/simdjson/commit/23b4bc93aa53a1205847155901f0bdf64b8fb107 "move amalgamate from bash to python (#1278)  This is much faster (from 3.5 to 0.14 seconds)") [#1278](https://github.com/simdjson/simdjson/pull/1278) [)](https://github.com/simdjson/simdjson/commit/23b4bc93aa53a1205847155901f0bdf64b8fb107 "move amalgamate from bash to python (#1278)  This is much faster (from 3.5 to 0.14 seconds)") | 6 years agoNov 3, 2020 |
| [.editorconfig](https://github.com/simdjson/simdjson/blob/master/.editorconfig ".editorconfig") | [.editorconfig](https://github.com/simdjson/simdjson/blob/master/.editorconfig ".editorconfig") | [\[skip ci\] Add an .editorconfig for .cpp/.h/.md for whitespace settings (](https://github.com/simdjson/simdjson/commit/c6ab52eebb3428f0f0bf7ed05d84d65eb7259859 "[skip ci] Add an .editorconfig for .cpp/.h/.md for whitespace settings (#1901)  Make it less likely to accidentally introduce tabs, trailing whitespace, carriage returns, non-utf8 in files, or files without trailing newlines.  https://editorconfig.org/ has plugins for various editors/IDEs and is enabled by default in some IDEs.") | 4 years agoOct 3, 2022 |
| [.gitattributes](https://github.com/simdjson/simdjson/blob/master/.gitattributes ".gitattributes") | [.gitattributes](https://github.com/simdjson/simdjson/blob/master/.gitattributes ".gitattributes") | [\[skip ci\] Add an .editorconfig for .cpp/.h/.md for whitespace settings (](https://github.com/simdjson/simdjson/commit/c6ab52eebb3428f0f0bf7ed05d84d65eb7259859 "[skip ci] Add an .editorconfig for .cpp/.h/.md for whitespace settings (#1901)  Make it less likely to accidentally introduce tabs, trailing whitespace, carriage returns, non-utf8 in files, or files without trailing newlines.  https://editorconfig.org/ has plugins for various editors/IDEs and is enabled by default in some IDEs.") | 4 years agoOct 3, 2022 |
| [.gitignore](https://github.com/simdjson/simdjson/blob/master/.gitignore ".gitignore") | [.gitignore](https://github.com/simdjson/simdjson/blob/master/.gitignore ".gitignore") | [remove cmake\_policy (](https://github.com/simdjson/simdjson/commit/d365cfb4a15027fa378453e139444d66b0f7ad44 "remove cmake_policy (#2404)  * properly gitignore Visual Studio artifacts  * remove cmake_policy") [#2404](https://github.com/simdjson/simdjson/pull/2404) [)](https://github.com/simdjson/simdjson/commit/d365cfb4a15027fa378453e139444d66b0f7ad44 "remove cmake_policy (#2404)  * properly gitignore Visual Studio artifacts  * remove cmake_policy") | last yearJul 31, 2025 |
| [AI\_USAGE\_POLICY.md](https://github.com/simdjson/simdjson/blob/master/AI_USAGE_POLICY.md "AI_USAGE_POLICY.md") | [AI\_USAGE\_POLICY.md](https://github.com/simdjson/simdjson/blob/master/AI_USAGE_POLICY.md "AI_USAGE_POLICY.md") | [trimming whitespace](https://github.com/simdjson/simdjson/commit/7ec4572d33da3727d7f05aa978872028ffe8e1a9 "trimming whitespace") | 8 months agoFeb 26, 2026 |
| [AUTHORS](https://github.com/simdjson/simdjson/blob/master/AUTHORS "AUTHORS") | [AUTHORS](https://github.com/simdjson/simdjson/blob/master/AUTHORS "AUTHORS") | [Update AUTHORS](https://github.com/simdjson/simdjson/commit/8cb383ed450daf45491776d536cfe8f48e937469 "Update AUTHORS") | 6 years agoApr 30, 2020 |
| [CMakeLists.txt](https://github.com/simdjson/simdjson/blob/master/CMakeLists.txt "CMakeLists.txt") | [CMakeLists.txt](https://github.com/simdjson/simdjson/blob/master/CMakeLists.txt "CMakeLists.txt") | [v5.0.2 release candidate (](https://github.com/simdjson/simdjson/commit/610f14d2140d5e702e2dee27545e6f4bd28fd7e2 "v5.0.2 release candidate (#2892)") [#2892](https://github.com/simdjson/simdjson/pull/2892) [)](https://github.com/simdjson/simdjson/commit/610f14d2140d5e702e2dee27545e6f4bd28fd7e2 "v5.0.2 release candidate (#2892)") | last weekSep 30, 2026 |
| [CONTRIBUTING.md](https://github.com/simdjson/simdjson/blob/master/CONTRIBUTING.md "CONTRIBUTING.md") | [CONTRIBUTING.md](https://github.com/simdjson/simdjson/blob/master/CONTRIBUTING.md "CONTRIBUTING.md") | [adding AI policy](https://github.com/simdjson/simdjson/commit/5891d4b64befe9635c1c08333f9561a82877d211 "adding AI policy") | 8 months agoFeb 26, 2026 |
| [CONTRIBUTORS](https://github.com/simdjson/simdjson/blob/master/CONTRIBUTORS "CONTRIBUTORS") | [CONTRIBUTORS](https://github.com/simdjson/simdjson/blob/master/CONTRIBUTORS "CONTRIBUTORS") | [Update CONTRIBUTORS](https://github.com/simdjson/simdjson/commit/dd4dce848eb5eca9d040ea2f75061fe80495cbc0 "Update CONTRIBUTORS") | 4 years agoMay 25, 2022 |
| [Doxyfile](https://github.com/simdjson/simdjson/blob/master/Doxyfile "Doxyfile") | [Doxyfile](https://github.com/simdjson/simdjson/blob/master/Doxyfile "Doxyfile") | [v5.0.2 release candidate (](https://github.com/simdjson/simdjson/commit/610f14d2140d5e702e2dee27545e6f4bd28fd7e2 "v5.0.2 release candidate (#2892)") [#2892](https://github.com/simdjson/simdjson/pull/2892) [)](https://github.com/simdjson/simdjson/commit/610f14d2140d5e702e2dee27545e6f4bd28fd7e2 "v5.0.2 release candidate (#2892)") | last weekSep 30, 2026 |
| [HACKING.md](https://github.com/simdjson/simdjson/blob/master/HACKING.md "HACKING.md") | [HACKING.md](https://github.com/simdjson/simdjson/blob/master/HACKING.md "HACKING.md") | [docs: fix cmake -B build directory in HACKING.md (](https://github.com/simdjson/simdjson/commit/275eaa5011ecce76c1e796626a06e7c016e16adf "docs: fix cmake -B build directory in HACKING.md (#2823)  Signed-off-by: ezralicodes <ezralicodes@users.noreply.github.com> Co-authored-by: ezralicodes <ezralicodes@users.noreply.github.com>") [#2823](https://github.com/simdjson/simdjson/pull/2823) [)](https://github.com/simdjson/simdjson/commit/275eaa5011ecce76c1e796626a06e7c016e16adf "docs: fix cmake -B build directory in HACKING.md (#2823)  Signed-off-by: ezralicodes <ezralicodes@users.noreply.github.com> Co-authored-by: ezralicodes <ezralicodes@users.noreply.github.com>") | 2 months agoAug 14, 2026 |
| [LICENSE](https://github.com/simdjson/simdjson/blob/master/LICENSE "LICENSE") | [LICENSE](https://github.com/simdjson/simdjson/blob/master/LICENSE "LICENSE") | [Introducing dual licensing (](https://github.com/simdjson/simdjson/commit/de4d69b3675c1acfd5f970a52ea67ae8d8e823e1 "Introducing dual licensing (#2328)  * Introducing dual licensing  * adding missing file") [#2328](https://github.com/simdjson/simdjson/pull/2328) [)](https://github.com/simdjson/simdjson/commit/de4d69b3675c1acfd5f970a52ea67ae8d8e823e1 "Introducing dual licensing (#2328)  * Introducing dual licensing  * adding missing file") | last yearJan 28, 2025 |
| [LICENSE-MIT](https://github.com/simdjson/simdjson/blob/master/LICENSE-MIT "LICENSE-MIT") | [LICENSE-MIT](https://github.com/simdjson/simdjson/blob/master/LICENSE-MIT "LICENSE-MIT") | [Introducing dual licensing (](https://github.com/simdjson/simdjson/commit/de4d69b3675c1acfd5f970a52ea67ae8d8e823e1 "Introducing dual licensing (#2328)  * Introducing dual licensing  * adding missing file") [#2328](https://github.com/simdjson/simdjson/pull/2328) [)](https://github.com/simdjson/simdjson/commit/de4d69b3675c1acfd5f970a52ea67ae8d8e823e1 "Introducing dual licensing (#2328)  * Introducing dual licensing  * adding missing file") | last yearJan 28, 2025 |
| [README.md](https://github.com/simdjson/simdjson/blob/master/README.md "README.md") | [README.md](https://github.com/simdjson/simdjson/blob/master/README.md "README.md") | [README: add fastpysimdjson to the bindings](https://github.com/simdjson/simdjson/commit/1a37712d31778299f4531aa6de10693ceb6f70db "README: add fastpysimdjson to the bindings") | 2 days agoOct 4, 2026 |
| [SECURITY.md](https://github.com/simdjson/simdjson/blob/master/SECURITY.md "SECURITY.md") | [SECURITY.md](https://github.com/simdjson/simdjson/blob/master/SECURITY.md "SECURITY.md") | [Create SECURITY.md](https://github.com/simdjson/simdjson/commit/6a5be0f0db9d9f5022db510bef17f3e7c7b6271a "Create SECURITY.md") | 2 years agoFeb 9, 2024 |
| [simdjson.pc.in](https://github.com/simdjson/simdjson/blob/master/simdjson.pc.in "simdjson.pc.in") | [simdjson.pc.in](https://github.com/simdjson/simdjson/blob/master/simdjson.pc.in "simdjson.pc.in") | [build: add pkg-config support (](https://github.com/simdjson/simdjson/commit/e5a408386b792de68639e8cb6051c4d2f2bf96ff "build: add pkg-config support (#1767)  * build: add pkg-config support  The CMake build script now generates a simple pkg-config files that can be easily used by non-CMake users.  The file is generated from a template file that gets filled in at configure time.  As CMake doesn't have anything similar to Meson's pkg-config generator the file is quite static, i.e. new simdjson public defines/dependencies won't be picked up automatically.  This approach also suffers from one minor issue, mentioned in [jtojnar/cmake-snips][]; in short, it doesn't work well when users specify CMAKE_INSTALL_INCLUDEDIR and similar as absolute paths. It's not a big deal, and it will easily fixable once you'll require CMake >=3.20.  Fixes #1763  [jtojnar/cmake-snips]: https://github.com/jtojnar/cmake-snips#concatenating-paths-when-building-pkg-config-files  * build: handle absolute paths in .pc generation  As mentioned in the previous commit message, correct concatenation of paths is only available in CMake >=3.20, so handling absolute paths in pkg-config file generation requires using jtojnar's JoinPaths module.  * ci: add debian job  This new jobs compiles simdjson on Debian Testing, a semi-rolling release, so that new compilers are always tested.  This job also tests the pkg-config file introduced in commit 1096c3b299fb32ec326ed823c9310b23f761de3c") [#1767](https://github.com/simdjson/simdjson/pull/1767) [)](https://github.com/simdjson/simdjson/commit/e5a408386b792de68639e8cb6051c4d2f2bf96ff "build: add pkg-config support (#1767)  * build: add pkg-config support  The CMake build script now generates a simple pkg-config files that can be easily used by non-CMake users.  The file is generated from a template file that gets filled in at configure time.  As CMake doesn't have anything similar to Meson's pkg-config generator the file is quite static, i.e. new simdjson public defines/dependencies won't be picked up automatically.  This approach also suffers from one minor issue, mentioned in [jtojnar/cmake-snips][]; in short, it doesn't work well when users specify CMAKE_INSTALL_INCLUDEDIR and similar as absolute paths. It's not a big deal, and it will easily fixable once you'll require CMake >=3.20.  Fixes #1763  [jtojnar/cmake-snips]: https://github.com/jtojnar/cmake-snips#concatenating-paths-when-building-pkg-config-files  * build: handle absolute paths in .pc generation  As mentioned in the previous commit message, correct concatenation of paths is only available in CMake >=3.20, so handling absolute paths in pkg-config file generation requires using jtojnar's JoinPaths module.  * ci: add debian job  This new jobs compiles simdjson on Debian Testing, a semi-rolling release, so that new compilers are always tested.  This job also tests the pkg-config file introduced in commit 1096c3b299fb32ec326ed823c9310b23f761de3c") | 4 years agoAug 26, 2022 |
| View all files |

## Repository files navigation

[![](https://camo.githubusercontent.com/bdab8113137dd06ba50aef7eb89eeed7720dcdc58e20539276b05f199e8b3ee3/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f4c6963656e73652d417061636865253230322d626c75652e737667)](https://github.com/simdjson/simdjson/blob/master/LICENSE)[![](https://camo.githubusercontent.com/08cef40a9105b6526ca22088bc514fbfdbc9aac1ddbf8d4e6c750e3a88a44dca/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f4c6963656e73652d4d49542d626c75652e737667)](https://github.com/simdjson/simdjson/blob/master/LICENSE-MIT)

[![Doxygen Documentation](https://camo.githubusercontent.com/77e264e4b70de38f9734a69ec3fdfd24e81ee147c17a1afee6de14bfc794ae9b/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f646f63732d646f787967656e2d677265656e2e737667)](https://simdjson.github.io/simdjson/)

# simdjson : Parsing gigabytes of JSON per second

[Permalink: simdjson : Parsing gigabytes of JSON per second](https://github.com/simdjson/simdjson#simdjson--parsing-gigabytes-of-json-per-second)

[![](https://github.com/simdjson/simdjson/raw/master/images/official_logo/logo_noir/SVG/logo_simdjson_noir.svg)](https://github.com/simdjson/simdjson/blob/master/images/official_logo/logo_noir/SVG/logo_simdjson_noir.svg)

JSON is everywhere on the Internet. Servers spend a _lot_ of time parsing it. We need a fresh
approach. The simdjson library uses commonly available SIMD instructions and microparallel algorithms
to parse JSON 4x faster than RapidJSON and 25x faster than JSON for Modern C++.

- **Fast:** Over 4x faster than commonly used production-grade JSON parsers.
- **Record Breaking Features:** Minify JSON at 6 GB/s, validate UTF-8 at 13 GB/s, NDJSON at 3.5 GB/s.
- **Easy:** First-class, easy to use and carefully documented APIs.
- **Strict:** Full JSON and UTF-8 validation, lossless parsing. Performance with no compromises.
- **Automatic:** Selects a CPU-tailored parser at runtime. No configuration needed.
- **Reliable:** From memory allocation to error handling, simdjson's design avoids surprises.
- **Peer Reviewed:** Our research appears in venues like VLDB Journal, Software: Practice and Experience.

This library is part of the [Awesome Modern C++](https://awesomecpp.com/) list.

## Table of Contents

[Permalink: Table of Contents](https://github.com/simdjson/simdjson#table-of-contents)

- [Real-world usage](https://github.com/simdjson/simdjson#real-world-usage)
- [Quick Start](https://github.com/simdjson/simdjson#quick-start)
- [Documentation](https://github.com/simdjson/simdjson#documentation)
- [Godbolt](https://github.com/simdjson/simdjson#godbolt)
- [Performance results](https://github.com/simdjson/simdjson#performance-results)
- [Packages](https://github.com/simdjson/simdjson#packages)
- [Bindings and Ports of simdjson](https://github.com/simdjson/simdjson#bindings-and-ports-of-simdjson)
- [About simdjson](https://github.com/simdjson/simdjson#about-simdjson)
- [Funding](https://github.com/simdjson/simdjson#funding)
- [Contributing to simdjson](https://github.com/simdjson/simdjson#contributing-to-simdjson)
- [License](https://github.com/simdjson/simdjson#license)

## Real-world usage

[Permalink: Real-world usage](https://github.com/simdjson/simdjson#real-world-usage)

- [Node.js](https://nodejs.org/)
- [ClickHouse](https://github.com/ClickHouse/ClickHouse)
- [Meta Velox](https://velox-lib.io/)
- [Google Pax](https://github.com/google/paxml)
- [milvus](https://github.com/milvus-io/milvus)
- [QuestDB](https://questdb.io/blog/questdb-release-8-0-3/)
- [Clang Build Analyzer](https://github.com/aras-p/ClangBuildAnalyzer)
- [Shopify HeapProfiler](https://github.com/Shopify/heap-profiler)
- [StarRocks](https://github.com/StarRocks/starrocks)
- [Microsoft FishStore](https://github.com/microsoft/FishStore)
- [Intel PCM](https://github.com/intel/pcm)
- [WatermelonDB](https://github.com/Nozbe/WatermelonDB)
- [Apache Doris](https://github.com/apache/doris)
- [Dgraph](https://github.com/dgraph-io/dgraph)
- [UCall](https://github.com/unum-cloud/UCall)
- [fastgltf](https://github.com/spnda/fastgltf)
- [tenzir](https://github.com/tenzir/tenzir)
- [ada-url](https://github.com/ada-url/ada)
- [fastgron](https://github.com/adamritter/fastgron)
- [WasmEdge](https://wasmedge.org/)
- [RonDB](https://github.com/logicalclocks/rondb)
- [GreptimeDB](https://github.com/GreptimeTeam/greptimedb)
- [mamba](https://github.com/mamba-org/mamba)
- [Ladybird Browser](https://ladybird.org/)
- [SereneDB](https://github.com/serenedb/serenedb)
- [YDB](https://github.com/ydb-platform/ydb)
- [ByConity](https://github.com/ByConity/ByConity)
- [Timeplus Proton](https://github.com/timeplus-io/proton)
- [TiFlash](https://github.com/pingcap/tiflash)
- [ata-validator](https://ata-validator.com/)

If you are planning to use simdjson in a product, please work from one of our releases.

## Quick Start

[Permalink: Quick Start](https://github.com/simdjson/simdjson#quick-start)

The simdjson library is easily consumable with a single .h and .cpp file.

0. Prerequisites: `g++` (version 7 or better) or `clang++` (version 6 or better), and a 64-bit
system with a command-line shell (e.g., Linux, macOS, freeBSD). We also support programming
environments like Visual Studio and Xcode, but different steps are needed. Users of clang++ may need to specify the C++ version (e.g., `c++ -std=c++17`) since clang++ tends to default on C++98.

1. Pull [simdjson.h](https://github.com/simdjson/simdjson/blob/master/singleheader/simdjson.h) and [simdjson.cpp](https://github.com/simdjson/simdjson/blob/master/singleheader/simdjson.cpp) into a
directory, along with the sample file [twitter.json](https://github.com/simdjson/simdjson/blob/master/jsonexamples/twitter.json). You can download them with the `wget` utility:



```
wget https://raw.githubusercontent.com/simdjson/simdjson/master/singleheader/simdjson.h https://raw.githubusercontent.com/simdjson/simdjson/master/singleheader/simdjson.cpp https://raw.githubusercontent.com/simdjson/simdjson/master/jsonexamples/twitter.json
```

2. Create `quickstart.cpp`:


```
#include <iostream>
#include "simdjson.h"
using namespace simdjson;
int main(void) {
    ondemand::parser parser;
    padded_string json = padded_string::load("twitter.json");
    ondemand::document tweets = parser.iterate(json);
    std::cout << uint64_t(tweets["search_metadata"]["count"]) << " results." << std::endl;
}
```

3. `c++ -o quickstart quickstart.cpp simdjson.cpp`
4. `./quickstart`

```
 100 results.
```

## Documentation

[Permalink: Documentation](https://github.com/simdjson/simdjson#documentation)

Usage documentation is available:

- [Basics](https://github.com/simdjson/simdjson/blob/master/doc/basics.md) is an overview of how to use simdjson and its APIs.
- [Builder](https://github.com/simdjson/simdjson/blob/master/doc/builder.md) is an overview of how to efficiently write JSON strings using simdjson.
- [Performance](https://github.com/simdjson/simdjson/blob/master/doc/performance.md) shows some more advanced scenarios and how to tune for them.
- [Implementation Selection](https://github.com/simdjson/simdjson/blob/master/doc/implementation-selection.md) describes runtime CPU detection and
how you can work with it.
- [API](https://simdjson.github.io/simdjson/) contains the automatically generated API documentation.
- [Compile-Time Parsing](https://github.com/simdjson/simdjson/blob/master/doc/compile_time.md) presents our compile-time parsing function (C++26 only).

## Godbolt

[Permalink: Godbolt](https://github.com/simdjson/simdjson#godbolt)

Some users may want to browse code along with the compiled assembly. The following examples use simdjson 5.0.1:

- [C++26 reflection example](https://godbolt.org/z/vc5j1vzje)
- [simdjson examples with errors handled through exceptions](https://godbolt.org/z/5jaofeq48)
- [simdjson examples with errors without exceptions](https://godbolt.org/z/K3M6Y4Knc)

## Performance results

[Permalink: Performance results](https://github.com/simdjson/simdjson#performance-results)

The simdjson library uses three-quarters less instructions than state-of-the-art parser [RapidJSON](https://rapidjson.org/). To our knowledge, simdjson is the first fully-validating JSON parser
to run at [gigabytes per second](https://en.wikipedia.org/wiki/Gigabyte) (GB/s) on commodity processors. It can parse millions of JSON documents per second on a single core.

The following figures show how fast simdjson maps JSON to and from your own
C++ structs, using C++26 static reflection with GCC 16.2 (-O3). The task is to parse
[twitter.json](https://github.com/simdjson/simdjson/blob/master/jsonexamples/twitter.json) into native data structures and to serialize
them back to JSON, on an Intel Xeon Gold 6548N (Emerald Rapids) processor. We compare
against the fastest C, C++ and Rust libraries, including [Glaze](https://github.com/stephenberry/glaze)
and [Serde](https://serde.rs/). The simdjson library offers full unicode ( [UTF-8](https://en.wikipedia.org/wiki/UTF-8))
validation and exact number parsing. You can reproduce these results with our
[static reflection benchmarks](https://github.com/simdjson/simdjson/blob/master/benchmark/static_reflect).

![Parsing twitter.json into native structs: simdjson 5.11 GB/s, Serde 1.85 GB/s, Glaze 1.67 GB/s, yyjson 1.18 GB/s, RapidJSON 0.85 GB/s, nlohmann::json 0.15 GB/s](https://github.com/simdjson/simdjson/raw/master/doc/perf_parsing_twitter.png)![Serializing native structs to twitter.json: simdjson 11.2 GB/s, Glaze 6.72 GB/s, Serde 1.85 GB/s, yyjson 1.55 GB/s, reflect-cpp 1.20 GB/s, nlohmann::json 0.19 GB/s](https://github.com/simdjson/simdjson/raw/master/doc/perf_serialization_twitter.png)

The simdjson library offers high speed whether it processes tiny files (e.g., 300 bytes)
or larger files (e.g., 3MB).

[All our experiments are reproducible](https://github.com/simdjson/simdjson_experiments_vldb2019).

For NDJSON files, we can exceed 3 GB/s with [our multithreaded parsing functions](https://github.com/simdjson/simdjson/blob/master/doc/parse_many.md).

## Packages

[Permalink: Packages](https://github.com/simdjson/simdjson#packages)

[![Packaging status](https://camo.githubusercontent.com/e00b14eb5a969398eee318265c7a26921785dc346f69d682286dd64f2f970f2f/68747470733a2f2f7265706f6c6f67792e6f72672f62616467652f766572746963616c2d616c6c7265706f732f73696d646a736f6e2e737667)](https://repology.org/project/simdjson/versions)

## Bindings and Ports of simdjson

[Permalink: Bindings and Ports of simdjson](https://github.com/simdjson/simdjson#bindings-and-ports-of-simdjson)

We distinguish between "bindings" (which just wrap the C++ code) and a port to another programming language (which reimplements everything).

- [ZippyJSON](https://github.com/michaeleisel/zippyjson): Swift bindings for the simdjson project.
- [libpy\_simdjson](https://github.com/gerrymanoim/libpy_simdjson/): high-speed Python bindings for simdjson using [libpy](https://github.com/quantopian/libpy).
- [pysimdjson](https://github.com/TkTech/pysimdjson): Python bindings for the simdjson project.
- [cysimdjson](https://github.com/TeskaLabs/cysimdjson): high-speed Python bindings for the simdjson project.
- [fastpysimdjson](https://github.com/simdjson/fastpysimdjson): fast JSON parsing in Python using simdjson.
- [simdjson-rs](https://github.com/simd-lite): Rust port.
- [simdjson-rust](https://github.com/SunDoge/simdjson-rust): Rust wrapper (bindings).
- [SimdJsonSharp](https://github.com/EgorBo/SimdJsonSharp): C# version for .NET Core (bindings and full port).
- [simdjson\_nodejs](https://github.com/luizperes/simdjson_nodejs): Node.js bindings for the simdjson project.
- [simdjson\_php](https://github.com/crazyxman/simdjson_php): PHP bindings for the simdjson project.
- [simdjson\_ruby](https://github.com/saka1/simdjson_ruby): Ruby bindings for the simdjson project.
- [fast\_jsonparser](https://github.com/anilmaurya/fast_jsonparser): Ruby bindings for the simdjson project.
- [simdjson-go](https://github.com/minio/simdjson-go): Go port using Golang assembly.
- [rcppsimdjson](https://github.com/eddelbuettel/rcppsimdjson): R bindings.
- [simdjson\_erlang](https://github.com/ChomperT/simdjson_erlang): erlang bindings.
- [simdjsone](https://github.com/saleyn/simdjsone): erlang bindings.
- [lua-simdjson](https://github.com/FourierTransformer/lua-simdjson): lua bindings.
- [hermes-json](https://hackage.haskell.org/package/hermes-json): haskell bindings.
- [zimdjson](https://github.com/EzequielRamis/zimdjson): Zig port.
- [simdjzon](https://github.com/travisstaloch/simdjzon): Zig port.
- [JSON-Simd](https://github.com/rawleyfowler/JSON-simd): Raku bindings.
- [JSON::SIMD](https://metacpan.org/pod/JSON::SIMD): Perl bindings; fully-featured JSON module that uses simdjson for decoding.
- [gemmaJSON](https://github.com/sainttttt/gemmaJSON): Nim JSON parser based on simdjson bindings.
- [simdjson-java](https://github.com/simdjson/simdjson-java): Java port.
- [mruby-fast-json](https://github.com/Asmod4n/mruby-fast-json): mruby binding with high API coverage.
- [simdjson-dart](https://github.com/xaldarof/simdjson-dart): Dart bindings for the simdjson project.

## About simdjson

[Permalink: About simdjson](https://github.com/simdjson/simdjson#about-simdjson)

The simdjson library takes advantage of modern microarchitectures, parallelizing with SIMD vector
instructions, reducing branch misprediction, and reducing data dependency to take advantage of each
CPU's multiple execution cores.

Our default front-end is called On-Demand, and we wrote a paper about it:

- John Keiser, Daniel Lemire, [On-Demand JSON: A Better Way to Parse Documents?](https://arxiv.org/abs/2312.17149), Software: Practice and Experience 54 (6), 2024.

Some people [enjoy reading the first (2019) simdjson paper](https://arxiv.org/abs/1902.08318): A description of the design
and implementation of simdjson is in our research article:

- Geoff Langdale, Daniel Lemire, [Parsing Gigabytes of JSON per Second](https://arxiv.org/abs/1902.08318), VLDB Journal 28 (6), 2019.

We have an in-depth paper focused on the UTF-8 validation:

- John Keiser, Daniel Lemire, [Validating UTF-8 In Less Than One Instruction Per Byte](https://arxiv.org/abs/2010.03090), Software: Practice & Experience 51 (5), 2021.

We also have an informal [blog post providing some background and context](https://branchfree.org/2019/02/25/paper-parsing-gigabytes-of-json-per-second/).

For the video inclined, we had a talk at QCon San Francisco 2019

[![simdjson at QCon San Francisco 2019](https://camo.githubusercontent.com/d0e990dc624935292988a2d677d6b211447f285647295602ff0006393965227a/68747470733a2f2f696d672e796f75747562652e636f6d2f76692f776c764b415437535a49512f302e6a7067)](https://www.youtube.com/watch?v=wlvKAT7SZIQ)

(It was the best voted talk, we're kinda proud of it.)

We also had a CppCon 2025 talk. We show how C++26 reflection allows for one-line serialization (to\_json(player)) or deserialization—without invasive macros or manual mapping—using nothing but the C++ standard library. Whether you’re a performance junkie or simply interested in the roadmap for the next decade of C++ development, watch our full talk!

[![simdjson at CppCon 2025](https://camo.githubusercontent.com/bbc59669dcab1abc601f4caa68f442f12102206205b68392e47288c62aa3e983/68747470733a2f2f696d672e796f75747562652e636f6d2f76692f4d63676b33437848594d732f302e6a7067)](https://www.youtube.com/watch?v=Mcgk3CxHYMs)

## Citing this work

[Permalink: Citing this work](https://github.com/simdjson/simdjson#citing-this-work)

If you use simdjson in published research, please cite the software library. A suitable BibTeX entry is:

```
@misc{simdjson,
  title={{The simdjson library: Parsing Gigabytes of JSON per Second}},
  author={Daniel Lemire and Geoff Langdale and John Keiser and Paul Dreik and Francisco Thiesen and others},
  year={2019},
  howpublished={Software library},
  note={https://github.com/simdjson/simdjson}
}
```

## Funding

[Permalink: Funding](https://github.com/simdjson/simdjson#funding)

The work is supported by the Natural Sciences and Engineering Research Council of Canada under grants
RGPIN-2017-03910 and RGPIN-2024-03787.

## Contributing to simdjson

[Permalink: Contributing to simdjson](https://github.com/simdjson/simdjson#contributing-to-simdjson)

Head over to [CONTRIBUTING.md](https://github.com/simdjson/simdjson/blob/master/CONTRIBUTING.md) for information on contributing to simdjson, and
[HACKING.md](https://github.com/simdjson/simdjson/blob/master/HACKING.md) for information on source, building, and architecture/design.

## License

[Permalink: License](https://github.com/simdjson/simdjson#license)

This code is made available under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.html) as well as under the MIT License. As a user, you can pick the license you prefer.

Under Windows, we build some tools using the windows/dirent\_portable.h file (which is outside our library code): it is under the liberal (business-friendly) MIT license.

For compilers that do not support [C++17](https://en.wikipedia.org/wiki/C%2B%2B17), we bundle the string-view library which is published under the [Boost license](https://www.boost.org/LICENSE_1_0.txt). Like the Apache license, the Boost license is a permissive license allowing commercial redistribution.

For efficient number serialization, we bundle Junekey Jeon's implementation of the Dragonbox algorithm for binary to decimal floating-point numbers ( [https://github.com/jk-jeon/dragonbox](https://github.com/jk-jeon/dragonbox)). The Dragonbox implementation is provided under the Apache License Version 2.0 with LLVM Exceptions (LICENSE-Apache2-LLVM or [https://llvm.org/foundation/relicensing/LICENSE.txt](https://llvm.org/foundation/relicensing/LICENSE.txt)) or the Boost Software License Version 1.0 (LICENSE-Boost or [https://www.boost.org/LICENSE\_1\_0.txt](https://www.boost.org/LICENSE_1_0.txt)).

For runtime dispatching, we use some code from the PyTorch project licensed under 3-clause BSD.

## About

Parsing gigabytes of JSON per second : used by Facebook/Meta Velox, the Node.js runtime, ClickHouse, WatermelonDB, Apache Doris, Milvus, StarRocks

[simdjson.org](https://simdjson.org/)

### Topics

[aarch64](https://github.com/topics/aarch64) [arm64](https://github.com/topics/arm64) [avx2](https://github.com/topics/avx2) [avx512](https://github.com/topics/avx512) [c-plus-plus](https://github.com/topics/c-plus-plus) [clang](https://github.com/topics/clang) [clang-cl](https://github.com/topics/clang-cl) [cpp11](https://github.com/topics/cpp11) [gcc-compiler](https://github.com/topics/gcc-compiler) [json](https://github.com/topics/json) [json-parser](https://github.com/topics/json-parser) [json-pointer](https://github.com/topics/json-pointer) [loongarch](https://github.com/topics/loongarch) [loongarch64](https://github.com/topics/loongarch64) [neon](https://github.com/topics/neon) [risc-v](https://github.com/topics/risc-v) [simd](https://github.com/topics/simd) [sse42](https://github.com/topics/sse42) [vs2019](https://github.com/topics/vs2019) [x64](https://github.com/topics/x64)

### Resources

[Readme](https://github.com/simdjson/simdjson#readme-ov-file)

Apache-2.0, MIT licenses found

### Contributing

[Contributing](https://github.com/simdjson/simdjson#contributing-ov-file)

### Security policy

[Security policy](https://github.com/simdjson/simdjson#security-ov-file)

[Activity](https://github.com/simdjson/simdjson/activity)

[Custom properties](https://github.com/simdjson/simdjson/custom-properties)

### Stars

**24.4k** stars

### Watchers

**245** watching

### Forks

[**1.3k** forks](https://github.com/simdjson/simdjson/forks)

[Report repository](https://github.com/contact/report-content?content_url=https%3A%2F%2Fgithub.com%2Fsimdjson%2Fsimdjson&report=simdjson+%28user%29)

## Releases

## Packages

## Used by

## Contributors

## Languages

You can’t perform that action at this time.