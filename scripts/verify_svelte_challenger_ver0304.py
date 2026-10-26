import ctypes
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path("/mnt/c/Users/james/Videos/deeds-web-app")
CHALLENGER_DIR = REPO_ROOT / ".tmp" / "atlas" / "svelte-grammar-challenger"
SO_PATH = CHALLENGER_DIR / "lib" / "tree-sitter-svelte-fork.so"
FORK_DIR = CHALLENGER_DIR / "fork"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "ver-03-04-svelte-grammar-challenger-receipt-v1.json"

BASELINE_FILES = [
    ("sveltekit-frontend/src/lib/components/AIChatAssistant.svelte", 11, 0),
    ("sveltekit-frontend/src/lib/components/ChatContextPanel.svelte", 12, 0),
    ("sveltekit-frontend/src/lib/components/ActionPopup.svelte", 6, 0),
    ("sveltekit-frontend/src/lib/components/CaseSelector.svelte", 10, 0),
    ("sveltekit-frontend/src/lib/components/ArchivedRoutesPanel.svelte", 41, 0),
    ("sveltekit-frontend/src/lib/components/CanvasEditor.svelte", 12, 0),
    ("sveltekit-frontend/src/lib/components/APITesterModal.svelte", 33, 1),
    ("sveltekit-frontend/src/lib/components/CaseOutcomePrediction.svelte", 146, 0),
    ("sveltekit-frontend/src/lib/components/ChatMessages.svelte", 14, 0),
    ("sveltekit-frontend/src/lib/components/ChatPanel.svelte", 17, 0),
]

def get_fork_commit():
    res = subprocess.run(["git", "-C", str(FORK_DIR), "rev-parse", "HEAD"], capture_output=True, text=True, check=True)
    return res.stdout.strip()

def get_so_sha256():
    with open(SO_PATH, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()

def traverse_elements(node, source_bytes):
    elements = []
    excluded_svelte_star = []
    script_style_count = 0
    snippet_count = 0
    render_count = 0

    def walk(n):
        nonlocal script_style_count, snippet_count, render_count
        if n.type == "snippet_statement":
            snippet_count += 1
        elif n.type == "render_tag":
            render_count += 1
        elif n.type in ("start_tag", "self_closing_tag"):
            tag_name = None
            for child in n.children:
                if child.type == "tag_name":
                    tag_name = source_bytes[child.start_byte:child.end_byte].decode("utf-8", errors="replace")
                    break
            if tag_name:
                if tag_name in ("script", "style"):
                    script_style_count += 1
                elif tag_name.startswith("svelte:"):
                    excluded_svelte_star.append((tag_name, n.start_byte, n.end_byte))
                else:
                    elements.append((tag_name, n.start_byte, n.end_byte))

        for child in n.children:
            walk(child)

    walk(node)
    return {
        "elements": elements,
        "excluded_svelte_star": excluded_svelte_star,
        "script_style_count": script_style_count,
        "snippet_count": snippet_count,
        "render_count": render_count,
    }


def main():
    import tree_sitter

    fork_commit = get_fork_commit()
    so_sha256 = get_so_sha256()

    lib = ctypes.cdll.LoadLibrary(str(SO_PATH))
    fn = getattr(lib, "tree_sitter_svelte")
    fn.restype = ctypes.c_void_p
    ptr = fn()
    lang = tree_sitter.Language(ptr)
    parser = tree_sitter.Parser(lang)

    print(f"Challenger Fork Commit: {fork_commit}")
    print(f"Library SHA-256: {so_sha256}")

    # 1. Test Svelte 5 challenger fixture
    fixture_path = CHALLENGER_DIR / "fixtures" / "svelte5-challenger.svelte"
    fixture_bytes = fixture_path.read_bytes()
    fixture_tree = parser.parse(fixture_bytes)

    assert not fixture_tree.root_node.has_error, "Fixture parse failed with syntax error"

    fixture_analysis = traverse_elements(fixture_tree.root_node, fixture_bytes)
    print("\n--- SVELTE 5 CHALLENGER FIXTURE ---")
    print(f"Elements: {len(fixture_analysis['elements'])} -> {[e[0] for e in fixture_analysis['elements']]}")
    print(f"Excluded svelte:* : {len(fixture_analysis['excluded_svelte_star'])} -> {[e[0] for e in fixture_analysis['excluded_svelte_star']]}")
    print(f"Snippets: {fixture_analysis['snippet_count']}")
    print(f"Render tags: {fixture_analysis['render_count']}")
    print(f"Script/Style: {fixture_analysis['script_style_count']}")

    assert fixture_analysis["snippet_count"] == 1, "Expected 1 snippet_statement"
    assert fixture_analysis["render_count"] == 1, "Expected 1 render_tag"
    assert len(fixture_analysis["excluded_svelte_star"]) == 1, "Expected 1 svelte:head excluded"
    assert fixture_analysis["excluded_svelte_star"][0][0] == "svelte:head"

    # 2. Test 10 baseline components
    print("\n--- 10 BASELINE COMPONENTS ---")
    results = []
    total_agree = 0
    total_parse_errors = 0

    for rel_path, expected_splitter, expected_excluded in BASELINE_FILES:
        full_path = REPO_ROOT / rel_path
        file_bytes = full_path.read_bytes()
        tree = parser.parse(file_bytes)
        has_err = tree.root_node.has_error
        if has_err:
            total_parse_errors += 1

        # Use element counting matching the splitter policy:
        # Count elements (RegularElement + Component), excluding script/style and svelte:*
        analysis = traverse_elements(tree.root_node, file_bytes)

        # Count distinct non-script/style, non-svelte:* elements
        # Note: tree-sitter parses <element> with <start_tag> and <end_tag>. We traversed element nodes.
        count = len(analysis["elements"])
        excluded_count = len(analysis["excluded_svelte_star"])

        match = (count == expected_splitter and excluded_count == expected_excluded and not has_err)
        if match:
            total_agree += 1

        print(f"File: {Path(rel_path).name:30} | Splitter: {expected_splitter:3} | Counted: {count:3} | Excluded: {excluded_count:2} | Err: {has_err} | Match: {match}")

        results.append({
            "file": rel_path,
            "splitterExpected": expected_splitter,
            "challengerCounted": count,
            "excludedSvelteStarExpected": expected_excluded,
            "excludedSvelteStarCounted": excluded_count,
            "excludedSvelteStarTags": [t[0] for t in analysis["excluded_svelte_star"]],
            "scriptStyleCount": analysis["script_style_count"],
            "parseError": has_err,
            "match": match,
        })

    print(f"\nTotal Agreement: {total_agree}/{len(BASELINE_FILES)}, Parse Errors: {total_parse_errors}")

    # 3. Build Reproducible Receipt
    receipt = {
        "schema": "ver-03-04-svelte-grammar-challenger-receipt-v1",
        "generated_at": "2026-10-26T18:32:00.000Z",
        "gate": "VER-03-04",
        "mode": "READ_ONLY_CHALLENGER_EVALUATION",
        "authority": False,
        "writesPerformed": False,
        "challenger": {
            "source": "https://github.com/sveltejs/tree-sitter-svelte",
            "commit": fork_commit,
            "libraryPath": ".tmp/atlas/svelte-grammar-challenger/lib/tree-sitter-svelte-fork.so",
            "librarySha256": so_sha256,
            "astGrepVersion": "0.45.3 linux (WSL)",
            "treeSitterVersion": "0.26.0 (python / gcc 13.3.0)",
        },
        "svelte5Fixture": {
            "path": ".tmp/atlas/svelte-grammar-challenger/fixtures/svelte5-challenger.svelte",
            "parseErrors": 0,
            "snippetCount": fixture_analysis["snippet_count"],
            "renderCount": fixture_analysis["render_count"],
            "excludedSvelteElements": [e[0] for e in fixture_analysis["excluded_svelte_star"]],
            "regularElementsCount": len(fixture_analysis["elements"]),
        },
        "baselineComparison": {
            "totalFiles": len(BASELINE_FILES),
            "agree": total_agree,
            "parseErrors": total_parse_errors,
            "results": results,
        },
        "policy": {
            "svelteStarExcluded": True,
            "rationale": "The splitter counts only RegularElement and Component; svelte:* special elements are excluded by design and reported separately.",
        },
        "status": "CHALLENGER_PROVEN" if total_agree == len(BASELINE_FILES) else "CHALLENGER_PARTIAL",
    }

    # Safe atomic write for receipt
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_report = REPORT_PATH.with_suffix(".tmp.json")
    with open(temp_report, "w", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2)
    temp_report.replace(REPORT_PATH)

    print(f"Receipt written safely to {REPORT_PATH}")

if __name__ == "__main__":
    main()
