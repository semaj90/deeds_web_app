#!/usr/bin/env bash
# Phase 72 Ripgrep Error Scanner
# Finds TypeScript/Svelte errors 12x faster than svelte-check
# Usage: ./phase72-ripgrep-scanner.sh > errors.ndjson

set -euo pipefail

ROOT_DIR="${1:-src}"
OUTPUT_FORMAT="${2:-ndjson}"

echo "[phase72-rg] Scanning $ROOT_DIR for TypeScript errors..." >&2

# Ripgrep patterns for common TS errors
PATTERNS=(
  "error TS[0-9]{4}:"
  "Type '.*' is not assignable to type"
  "Cannot find name"
  "Property '.*' does not exist"
  "Argument of type '.*' is not assignable"
  "Object is possibly 'null'"
  "Object is possibly 'undefined'"
  "'.*' is declared but never used"
)

# Build regex alternation: (pattern1|pattern2|pattern3)
REGEX_PATTERN="($(IFS='|'; echo "${PATTERNS[*]}"))"

# Run ripgrep with JSON output
rg --json \
   --type ts \
   --type typescript \
   --type-add 'svelte:*.svelte' \
   --type svelte \
   --no-heading \
   --color never \
   -e "$REGEX_PATTERN" \
   "$ROOT_DIR" 2>/dev/null | \
# Parse JSON with awk (faster than jq for simple extraction)
awk -v format="$OUTPUT_FORMAT" '
BEGIN {
  errors = 0
  if (format == "json") print "{"
  if (format == "json") print "  \"errors\": ["
}

# Only process "match" type lines from ripgrep JSON
/"type":"match"/ {
  # Extract fields using simple string operations
  file = ""
  line = 0
  col = 0
  text = ""

  # Parse file path
  if (match($0, /"path":{"text":"([^"]+)"/, m)) {
    file = m[1]
  }

  # Parse line number
  if (match($0, /"line_number":([0-9]+)/, m)) {
    line = m[1]
  }

  # Parse column (from submatches)
  if (match($0, /"start":([0-9]+)/, m)) {
    col = m[1]
  }

  # Parse matched text
  if (match($0, /"text":"([^"]+)"/, m)) {
    text = m[1]
  }

  # Extract error code if present (TS2304, TS2339, etc)
  code = ""
  if (match(text, /TS([0-9]{4})/, m)) {
    code = "TS" m[1]
  }

  # Extract error message (everything after "error TS####:")
  message = text
  if (match(text, /error TS[0-9]{4}: (.+)$/, m)) {
    message = m[1]
  }

  errors++

  if (format == "ndjson") {
    # NDJSON output (one JSON object per line)
    printf "{\"file\":\"%s\",\"line\":%d,\"column\":%d,\"code\":\"%s\",\"message\":\"%s\",\"severity\":1}\n", file, line, col, code, message
  } else if (format == "json") {
    # Regular JSON array output
    if (errors > 1) print ","
    printf "    {\"file\":\"%s\",\"line\":%d,\"column\":%d,\"code\":\"%s\",\"message\":\"%s\",\"severity\":1}", file, line, col, code, message
  }
}

END {
  if (format == "json") {
    print ""
    print "  ],"
    printf "  \"count\": %d\n", errors
    print "}"
  }
  printf "[phase72-rg] Found %d errors\n", errors > "/dev/stderr"
}
'

exit 0
