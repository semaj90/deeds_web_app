import hashlib


NODE_KIND_MAP = {
    "if_statement": "if_block",
    "else_if_block": "if_block",
    "else_if_statement": "if_block",
    "each_statement": "each_block",
    "await_statement": "await_block",
    "key_statement": "key_block",
    "snippet_statement": "snippet_block",
    "render_expr": "render_tag",
}


def _walk(node):
    yield node
    for child in node.children:
        yield from _walk(child)


def extract_svelte_cst_observations(source_bytes, parser):
    if not isinstance(source_bytes, bytes):
        raise TypeError("source_bytes must be bytes")

    tree = parser.parse(source_bytes)
    root = tree.root_node
    observations = []
    errors = []
    for node in _walk(root):
        start = node.start_byte
        end = node.end_byte
        raw_slice = source_bytes[start:end]
        try:
            source_slice = raw_slice.decode("utf-8")
            utf8_round_trip = source_slice.encode("utf-8") == raw_slice
        except UnicodeDecodeError:
            source_slice = raw_slice.decode("utf-8", errors="replace")
            utf8_round_trip = False
        if node.type == "ERROR" or node.is_missing:
            errors.append({
                "nodeType": node.type,
                "startByte": start,
                "endByte": end,
                "sourceSlice": source_slice,
                "missing": bool(node.is_missing),
            })
        kind = NODE_KIND_MAP.get(node.type)
        if kind is None:
            continue
        observations.append({
            "kind": kind,
            "nodeType": node.type,
            "startByte": start,
            "endByte": end,
            "sourceSlice": source_slice,
            "sliceSha256": hashlib.sha256(raw_slice).hexdigest(),
            "byteSliceVerified": 0 <= start <= end <= len(source_bytes) and utf8_round_trip,
        })

    return {
        "schema": "atlas.svelte-language-pack-cst-observations.v1",
        "sourceSha256": hashlib.sha256(source_bytes).hexdigest(),
        "sourceByteLength": len(source_bytes),
        "parserHasError": bool(root.has_error),
        "errors": errors,
        "observations": observations,
        "extractionCoverage": "PARTIAL" if root.has_error else "CST_NODES_ONLY",
        "proposalOnly": True,
        "canonicalAuthority": False,
    }
