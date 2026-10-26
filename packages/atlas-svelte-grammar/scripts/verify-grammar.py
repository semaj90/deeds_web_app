import ctypes
import hashlib
import json
import subprocess
import sys
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parent.parent
SO_PATH = PKG_ROOT / "dist" / "linux-x64" / "tree-sitter-svelte.so"
FIXTURE_PATH = PKG_ROOT / "fixtures" / "svelte5-fixture.svelte"

def main():
    if not SO_PATH.exists():
        print(f"Error: {SO_PATH} does not exist.")
        sys.exit(1)

    with open(SO_PATH, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    print(f"Verifying {SO_PATH} (sha256: {digest})...")

    lib = ctypes.cdll.LoadLibrary(str(SO_PATH))
    fn = getattr(lib, "tree_sitter_svelte")
    fn.restype = ctypes.c_void_p
    ptr = fn()
    print(f"tree_sitter_svelte entrypoint loaded: {hex(ptr)}")

    import tree_sitter
    lang = tree_sitter.Language(ptr)
    parser = tree_sitter.Parser(lang)

    fixture_bytes = FIXTURE_PATH.read_bytes()
    tree = parser.parse(fixture_bytes)

    if tree.root_node.has_error:
        print("FAIL: Svelte 5 fixture parse contains errors!")
        sys.exit(1)

    print("PASS: Svelte 5 fixture parsed with 0 errors.")

    elements = []
    excluded_svelte = []
    snippets = 0
    renders = 0

    def walk(n):
        nonlocal snippets, renders
        if n.type == "snippet_statement":
            snippets += 1
        elif n.type == "render_tag":
            renders += 1
        elif n.type in ("start_tag", "self_closing_tag"):
            for child in n.children:
                if child.type == "tag_name":
                    tag = fixture_bytes[child.start_byte:child.end_byte].decode("utf-8")
                    if tag.startswith("svelte:"):
                        excluded_svelte.append(tag)
                    elif tag not in ("script", "style"):
                        elements.append(tag)
                    break
        for child in n.children:
            walk(child)

    walk(tree.root_node)

    print(f"Elements: {elements} (expected 6)")
    print(f"Excluded: {excluded_svelte} (expected ['svelte:head'])")
    print(f"Snippets: {snippets} (expected 1)")
    print(f"Renders:  {renders} (expected 1)")

    assert len(elements) == 6
    assert excluded_svelte == ["svelte:head"]
    assert snippets == 1
    assert renders == 1

    print("ALL VERIFICATIONS PASSED!")

if __name__ == "__main__":
    main()
