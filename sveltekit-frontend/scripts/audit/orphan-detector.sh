#!/usr/bin/env bash
# 10-Layer Orphan Detector v2 — Enhanced single-pass ripgrep + awk pipeline
# Usage: bash scripts/audit/orphan-detector.sh [directory]
# Default: src/lib/components/
#
# Enhancements over v1:
#   - Name collision detection (same basename, different paths)
#   - Path-aware matching for colliding names
#   - Git-deleted file detection
#   - Config file reference scanning (L6)
#   - .svelte.ts store consumer scanning (L10)
#   - Machine-readable report output (.orphan-report.txt)
#   - Summary statistics by directory

set -u

TARGET_DIR="${1:-src/lib/components}"
SRC_DIR="src"
TMP=".orphan-audit-tmp"
REPORT=".orphan-report.txt"
rm -rf "$TMP"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

# Array form prevents glob expansion (MSYS bash expands *.ts → matching files)
RG_GLOB=(--glob '*.ts' --glob '*.svelte' --glob '*.js' --glob '*.mjs' --glob '*.svelte.ts')
RG_CFG=(--glob '*.config.ts' --glob '*.config.js' --glob 'svelte.config.*')

RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
CYN='\033[0;36m'
MAG='\033[0;35m'
DIM='\033[2m'
NC='\033[0m'

echo -e "${CYN}=== 10-Layer Orphan Detector v2 ===${NC}"
echo "Target: $TARGET_DIR"

# ──── Collect components (exclude SvelteKit route files) ────
find "$TARGET_DIR" -name "*.svelte" -type f \
  ! -name "+page.svelte" ! -name "+layout.svelte" ! -name "+error.svelte" \
  2>/dev/null | sort > "$TMP/components.txt"

TOTAL=$(wc -l < "$TMP/components.txt" | tr -d ' ')
echo "Scanning $TOTAL .svelte files..."
echo ""

# ──── Name collision detection ────
echo -e "${DIM}Checking name collisions...${NC}"
awk -F/ '{print $NF}' "$TMP/components.txt" | sort | uniq -c | sort -rn \
  | awk '$1 > 1 {print $2}' > "$TMP/collisions.txt"
COLLISION_COUNT=$(wc -l < "$TMP/collisions.txt" | tr -d ' ')
if [ "$COLLISION_COUNT" -gt 0 ]; then
  echo -e "${MAG}  $COLLISION_COUNT basename collisions detected (path-aware matching enabled)${NC}"
fi

# ──── L1: Static ESM imports (full paths for collision resolution) ────
echo -e "${DIM}L1: Static imports...${NC}"
# Basename-only refs (fast path for non-colliding names)
rg --no-filename -o "from\s+['\"][^'\"]*['\"]" "$SRC_DIR" "${RG_GLOB[@]}" 2>/dev/null \
  | tr -d '\r' \
  | awk -F"['\"]" '{print $2}' \
  | awk -F/ '{print $NF}' \
  | sed -e 's/\.js$//' -e 's/\.ts$//' -e 's/\.svelte$//' \
  | sort | uniq -c > "$TMP/L1.txt"

# Full path refs (for collision resolution)
rg --no-filename -o "from\s+['\"][^'\"]*['\"]" "$SRC_DIR" "${RG_GLOB[@]}" 2>/dev/null \
  | tr -d '\r' \
  | awk -F"['\"]" '{print $2}' \
  | sed -e 's/\.js$//' -e 's/\.ts$//' -e 's/\.svelte$//' \
  | sort | uniq -c > "$TMP/L1_full.txt"

# ──── L2: Dynamic ESM imports ────
echo -e "${DIM}L2: Dynamic imports...${NC}"
rg --no-filename -o "import\(['\"][^'\"]*['\"]" "$SRC_DIR" "${RG_GLOB[@]}" 2>/dev/null \
  | tr -d '\r' \
  | awk -F"['\"]" '{print $2}' \
  | awk -F/ '{print $NF}' \
  | sed -e 's/\.js$//' -e 's/\.ts$//' -e 's/\.svelte$//' \
  | sort | uniq -c > "$TMP/L2.txt"

# Full path refs for L2
rg --no-filename -o "import\(['\"][^'\"]*['\"]" "$SRC_DIR" "${RG_GLOB[@]}" 2>/dev/null \
  | tr -d '\r' \
  | awk -F"['\"]" '{print $2}' \
  | sed -e 's/\.js$//' -e 's/\.ts$//' -e 's/\.svelte$//' \
  | sort | uniq -c > "$TMP/L2_full.txt"

# ──── L3: CJS require ────
echo -e "${DIM}L3: CJS require...${NC}"
rg --no-filename -o "require\(['\"][^'\"]*['\"]" "$SRC_DIR" "${RG_GLOB[@]}" 2>/dev/null \
  | tr -d '\r' \
  | awk -F"['\"]" '{print $2}' \
  | awk -F/ '{print $NF}' \
  | sed -e 's/\.js$//' -e 's/\.ts$//' \
  | sort | uniq -c > "$TMP/L3.txt"
touch "$TMP/L3.txt"

# ──── Merge L1+L2+L3 into lookup table ────
echo -e "${DIM}Building lookup table...${NC}"
awk '{refs[$2]+=$1} END {for(n in refs) print n, refs[n]}' \
  "$TMP/L1.txt" "$TMP/L2.txt" "$TMP/L3.txt" > "$TMP/refs.txt"

REF_COUNT=$(wc -l < "$TMP/refs.txt" | tr -d ' ')
echo -e "${DIM}  $REF_COUNT unique module names indexed${NC}"

# ──── L6: Config file references ────
echo -e "${DIM}L6: Config file references...${NC}"
: > "$TMP/L6.txt"
for CFG in unocss.config.ts vite.config.ts svelte.config.js svelte.config.ts; do
  if [ -f "$CFG" ]; then
    rg -o "[A-Z][a-zA-Z]+" "$CFG" 2>/dev/null | tr -d '\r' | sort -u >> "$TMP/L6.txt"
  fi
done

# ──── L8: Barrel re-exports with consumers ────
echo -e "${DIM}L8: Barrel re-exports...${NC}"
: > "$TMP/L8.txt"
find "$TARGET_DIR" -name "index.ts" -type f 2>/dev/null | while IFS= read -r IDX; do
  DIR_NAME=$(basename "$(dirname "$IDX")")
  CONSUMERS=$(rg -c "from\s+['\"].*/${DIR_NAME}['\"]" "$SRC_DIR" "${RG_GLOB[@]}" 2>/dev/null \
    | tr -d '\r' | awk -F: '{s+=$NF}END{print s+0}')
  CONSUMERS=${CONSUMERS:-0}
  if [ "$CONSUMERS" -gt 0 ] 2>/dev/null; then
    rg -o "from\s+['\"]\.\/[^'\"]*['\"]" "$IDX" 2>/dev/null \
      | tr -d '\r' \
      | awk -F"['\"]" '{print $2}' \
      | awk -F/ '{print $NF}' \
      | sed -e 's/\.js$//' -e 's/\.svelte$//' \
      >> "$TMP/L8.txt"
  fi
done

# ──── L9: Event listeners in components ────
echo -e "${DIM}L9: Event listeners...${NC}"
rg -l "addEventListener" "$TARGET_DIR" --glob '*.svelte' 2>/dev/null \
  | tr -d '\r' \
  | while IFS= read -r F; do basename "$F" .svelte; done \
  > "$TMP/L9.txt" 2>/dev/null
touch "$TMP/L9.txt"

# ──── L10: CustomEvent dispatchers that reference component names ────
echo -e "${DIM}L10: CustomEvent dispatch scan...${NC}"
rg --no-filename -o "CustomEvent\(['\"][^'\"]*['\"]" "$SRC_DIR" "${RG_GLOB[@]}" 2>/dev/null \
  | tr -d '\r' \
  | awk -F"['\"]" '{print $2}' \
  | sort -u > "$TMP/L10_events.txt"
touch "$TMP/L10_events.txt"

# Also scan for dispatchEvent with component-like event names
rg --no-filename -o "dispatchEvent.*['\"][a-zA-Z:_-]+['\"]" "$SRC_DIR" "${RG_GLOB[@]}" 2>/dev/null \
  | tr -d '\r' >> "$TMP/L10_events.txt" 2>/dev/null

# ──── L4: @vite-ignore files ────
echo -e "${DIM}L4: @vite-ignore...${NC}"
rg -l "@vite-ignore" "$SRC_DIR" "${RG_GLOB[@]}" 2>/dev/null \
  | tr -d '\r' > "$TMP/L4.txt" 2>/dev/null
touch "$TMP/L4.txt"

# ──── Git deleted files ────
echo -e "${DIM}Git: Checking deleted files...${NC}"
git diff --name-status HEAD 2>/dev/null \
  | tr -d '\r' \
  | awk '/^D/ && /\.svelte$/ {print $2}' > "$TMP/git_deleted.txt" 2>/dev/null
touch "$TMP/git_deleted.txt"

GIT_DEL=$(wc -l < "$TMP/git_deleted.txt" | tr -d ' ')
if [ "$GIT_DEL" -gt 0 ]; then
  echo -e "${MAG}  $GIT_DEL .svelte files staged for deletion in git${NC}"
fi

echo ""
echo "────────────────────────────────────────────────"
echo ""

# ──── Cross-reference ────
ORPHANS=0
EDGES=0
WIRED=0
COLLIDE_WARN=0

# Initialize report
: > "$REPORT"
echo "# Orphan Detector Report — $(date '+%Y-%m-%d %H:%M')" >> "$REPORT"
echo "# Target: $TARGET_DIR | Total: $TOTAL" >> "$REPORT"
echo "" >> "$REPORT"

while IFS= read -r FILEPATH; do
  BASENAME=$(basename "$FILEPATH" .svelte)
  RELPATH="${FILEPATH#src/}"
  LINES=$(wc -l < "$FILEPATH" 2>/dev/null | tr -d ' ')

  # Check if this file is git-deleted
  IS_DELETED=0
  if grep -q "$FILEPATH" "$TMP/git_deleted.txt" 2>/dev/null; then
    IS_DELETED=1
  fi

  # L1+L2+L3: merged refs lookup
  REFS=$(awk -v mod="$BASENAME" '$1==mod {print $2; exit}' "$TMP/refs.txt")
  REFS=${REFS:-0}

  # Name collision check — if this basename collides with another file,
  # verify the FULL PATH matches to avoid false wiring
  IS_COLLISION=0
  if grep -qw "$BASENAME.svelte" "$TMP/collisions.txt" 2>/dev/null; then
    IS_COLLISION=1
    if [ "$REFS" -gt 0 ]; then
      # Construct partial paths to check: components/subdir/Name
      PARENT_DIR=$(basename "$(dirname "$FILEPATH")")
      PARTIAL="${PARENT_DIR}/${BASENAME}"

      # Check full-path refs for this specific component
      FULL_REFS=$(grep -c "$PARTIAL" "$TMP/L1_full.txt" 2>/dev/null | tr -dc '0-9')
      FULL_REFS2=$(grep -c "$PARTIAL" "$TMP/L2_full.txt" 2>/dev/null | tr -dc '0-9')
      FULL_REFS=${FULL_REFS:-0}
      FULL_REFS2=${FULL_REFS2:-0}
      FULL_REFS=$(( FULL_REFS + FULL_REFS2 ))

      if [ "$FULL_REFS" -eq 0 ]; then
        # This component's basename is imported somewhere, but NOT this specific path
        REFS=0
        COLLIDE_WARN=$((COLLIDE_WARN + 1))
      fi
    fi
  fi

  # L6: Config reference
  CONFIG_REF=0
  if grep -qw "$BASENAME" "$TMP/L6.txt" 2>/dev/null; then
    CONFIG_REF=1
  fi

  # L8: barrel wired
  BARREL=0
  if grep -qw "$BASENAME" "$TMP/L8.txt" 2>/dev/null; then
    BARREL=1
  fi

  # L9: event listener in this file
  HAS_EVENTS=0
  if grep -qw "$BASENAME" "$TMP/L9.txt" 2>/dev/null; then
    HAS_EVENTS=1
  fi

  TOTAL_REFS=$((REFS + BARREL + CONFIG_REF))

  # Determine status
  STATUS="WIRED"
  if [ "$TOTAL_REFS" -eq 0 ]; then
    if [ "$HAS_EVENTS" -gt 0 ]; then
      STATUS="EDGE"
    else
      STATUS="ORPHAN"
    fi
  fi

  # Print + log
  if [ "$STATUS" = "ORPHAN" ]; then
    SUFFIX=""
    if [ "$IS_COLLISION" -gt 0 ]; then
      SUFFIX=" ${MAG}[name collision — path-verified]${NC}"
    fi
    if [ "$IS_DELETED" -gt 0 ]; then
      SUFFIX="${SUFFIX} ${RED}[git deleted]${NC}"
    fi
    echo -e "${RED}ORPHAN${NC} $RELPATH  ${DIM}(${LINES}L)${NC}${SUFFIX}"
    echo "ORPHAN $RELPATH ${LINES}L" >> "$REPORT"
    ORPHANS=$((ORPHANS + 1))
  elif [ "$STATUS" = "EDGE" ]; then
    echo -e "${YEL}EDGE${NC}   $RELPATH  ${DIM}(${LINES}L — addEventListener, check L9)${NC}"
    echo "EDGE $RELPATH ${LINES}L" >> "$REPORT"
    EDGES=$((EDGES + 1))
  else
    WIRED=$((WIRED + 1))
  fi
done < "$TMP/components.txt"

echo ""
echo "════════════════════════════════════════════════"
echo -e " ${GRN}$WIRED wired${NC}  │  ${RED}$ORPHANS orphans${NC}  │  ${YEL}$EDGES edge cases${NC}  │  $TOTAL total"
if [ "$COLLIDE_WARN" -gt 0 ]; then
  echo -e " ${MAG}$COLLIDE_WARN name-collision false positives caught${NC}"
fi
echo "════════════════════════════════════════════════"

# ──── @vite-ignore report ────
VITE_COUNT=$(wc -l < "$TMP/L4.txt" | tr -d ' ')
if [ "$VITE_COUNT" -gt 0 ]; then
  echo ""
  echo -e "${CYN}L4: $VITE_COUNT @vite-ignore files (may load orphans via variable):${NC}"
  sed 's/^/  /' "$TMP/L4.txt"
fi

# ──── Git deleted report ────
if [ "$GIT_DEL" -gt 0 ]; then
  echo ""
  echo -e "${MAG}Git: $GIT_DEL files staged for deletion:${NC}"
  sed 's/^/  /' "$TMP/git_deleted.txt"
fi

# ──── Name collision report ────
if [ "$COLLISION_COUNT" -gt 0 ]; then
  echo ""
  echo -e "${MAG}Name collisions ($COLLISION_COUNT basenames shared by 2+ files):${NC}"
  while IFS= read -r CNAME; do
    CPATHS=$(grep "/${CNAME}$" "$TMP/components.txt" | sed "s/^/    /")
    echo -e "  ${DIM}${CNAME}:${NC}"
    echo "$CPATHS"
  done < "$TMP/collisions.txt"
fi

# ──── Directory breakdown ────
echo ""
echo -e "${CYN}Orphan breakdown by directory:${NC}"
awk '/^ORPHAN/ {
  n=split($2, parts, "/");
  if (n >= 3) dir=parts[1]"/"parts[2]"/"parts[3];
  else dir=$2;
  dirs[dir]++;
  lines[dir]+=$3;
} END {
  for (d in dirs) printf "  %-45s %2d orphans  %5dL\n", d, dirs[d], lines[d];
}' "$REPORT" | sort -t'/' -k3

# ──── CustomEvent summary ────
EVT_COUNT=$(wc -l < "$TMP/L10_events.txt" | tr -d ' ')
if [ "$EVT_COUNT" -gt 0 ]; then
  echo ""
  echo -e "${CYN}L10: $EVT_COUNT unique CustomEvent types in codebase${NC}"
fi

echo ""
echo -e "${DIM}Report saved to: $REPORT${NC}"
echo -e "${DIM}Edge cases need manual L4/L9/L10 verification (event coupling, variable imports)${NC}"

# ──── Append summary to report ────
echo "" >> "$REPORT"
echo "# Summary: $WIRED wired | $ORPHANS orphans | $EDGES edge | $TOTAL total" >> "$REPORT"
echo "# Collisions caught: $COLLIDE_WARN" >> "$REPORT"
echo "# Git deleted: $GIT_DEL" >> "$REPORT"