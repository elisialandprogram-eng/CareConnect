#!/usr/bin/env bash
# =============================================================================
# GoldenLife — CI Currency & Timezone Guard (Section 7 / Section 8)
#
# Two tiers:
#  HARD — build must fail (zero tolerance for these patterns)
#  SOFT — advisory warnings (informational; non-monetary toFixed etc.)
#
# Usage:
#   bash scripts/ci-currency-timezone-guard.sh           # hard fail on violations
#   bash scripts/ci-currency-timezone-guard.sh --warn-only  # always exit 0
# =============================================================================

set -euo pipefail

WARN_ONLY=false
[[ "${1:-}" == "--warn-only" ]] && WARN_ONLY=true

RED="\033[0;31m"
YEL="\033[0;33m"
GRN="\033[0;32m"
CYN="\033[0;36m"
BLD="\033[1m"
RST="\033[0m"

HARD_VIOLATIONS=0
SOFT_WARNINGS=0
SCAN_DIRS=("client/src" "server")

# ── Core scanner ────────────────────────────────────────────────────────────
# Args: severity category description grep-pattern [grep-exclude-patterns...]
_scan() {
  local severity="$1" category="$2" description="$3" pattern="$4"
  shift 4
  local extra_greps=("$@")

  local raw
  raw=$(
    grep -rn \
      --include="*.ts" --include="*.tsx" \
      --exclude-dir=node_modules \
      --exclude-dir=dist \
      --exclude-dir=".git" \
      --exclude-dir=strict-enforcer \
      --exclude="currency.ts" \
      --exclude="datetime.ts" \
      --exclude="format-utils.ts" \
      --exclude="invoice-gen.ts" \
      --exclude="*.test.ts" \
      -E "$pattern" \
      "${SCAN_DIRS[@]}" 2>/dev/null || true
  )

  # Apply additional grep -v filters
  local filtered="$raw"
  for ex in "${extra_greps[@]}"; do
    filtered=$(echo "$filtered" | grep -v -E "$ex" || true)
  done

  [[ -z "$filtered" ]] && return

  local count
  count=$(echo "$filtered" | wc -l | tr -d ' ')

  if [[ "$severity" == "HARD" ]]; then
    echo -e "${RED}${BLD}[HARD]${RST} ${category}: ${description}"
    echo "$filtered" | head -20 | while IFS= read -r line; do
      echo -e "  ${YEL}${line}${RST}"
    done
    echo -e "  ${RED}↑ ${count} match(es) — must fix before merge${RST}"
    echo ""
    HARD_VIOLATIONS=$((HARD_VIOLATIONS + count))
  else
    echo -e "${CYN}${BLD}[SOFT]${RST} ${category}: ${description}"
    echo "$filtered" | head -15 | while IFS= read -r line; do
      echo -e "  ${YEL}${line}${RST}"
    done
    echo -e "  ${CYN}↑ ${count} advisory — confirm each is non-monetary${RST}"
    echo ""
    SOFT_WARNINGS=$((SOFT_WARNINGS + count))
  fi
}

echo ""
echo -e "${BLD}═══════════════════════════════════════════════════════${RST}"
echo -e "${BLD}  GoldenLife — Currency & Timezone Compliance Guard${RST}"
echo -e "${BLD}═══════════════════════════════════════════════════════${RST}"
echo ""
echo -e "${BLD}── HARD CHECKS (build fails on any match) ──────────────${RST}"
echo ""

# ── HARD: Timezone violations ─────────────────────────────────────────────
# Pattern: new Date(anything).toLocaleXxx( — but not in canonical files
# Exclusions: SQL strings (all appear inside backtick SQL, filtered by excluding
#             lines that also contain SQL keywords)

_scan HARD "TIMEZONE" \
  "new Date(...).toLocaleString() — use formatDateTime() from @/lib/datetime" \
  'new Date\([^)]*\)\.toLocaleString\(' \
  '^\s*//' 'pdfkit'

_scan HARD "TIMEZONE" \
  "new Date(...).toLocaleDateString() — use formatDate() from @/lib/datetime" \
  'new Date\([^)]*\)\.toLocaleDateString\(' \
  '^\s*//'

_scan HARD "TIMEZONE" \
  "new Date(...).toLocaleTimeString() — use formatTime() from @/lib/datetime" \
  'new Date\([^)]*\)\.toLocaleTimeString\(' \
  '^\s*//'

# ── HARD: Hardcoded $ currency symbol in JSX/string output ───────────────
# Specifically: dollar-sign immediately followed by a digit in string output context.
# Excludes:
#   - PostgreSQL parameter placeholders: $1, $2, $3, ... (look like `$N` in SQL)
#   - Template-literal SQL param builders: `$${...}` 
#   - Comments (// or * lines)
#   - Documentation strings (> $0.05, threshold descriptions)

_scan HARD "CURRENCY" \
  'Hardcoded "$N" dollar+digit in output strings (use canonical formatter, not $ literal)' \
  '["'"'"'`]\$[0-9]|>\$[0-9]|\$\$\{[^}]+\} (USD|wallet|bonus|credit)' \
  '^\s*//' \
  '\$[0-9]+\b[^.]' \
  'params\.length' \
  'placeholders' \
  'AND ' \
  'WHERE ' \
  'drift >' \
  'discrepancy' \
  'threshold'

# ── HARD: Local formatCurrency / formatMoney function definitions ──────────

_scan HARD "CURRENCY" \
  "Local formatCurrency function defined (not destructured) — import from @/lib/currency" \
  'function formatCurrency\b' \
  '^\s*//'

_scan HARD "CURRENCY" \
  "Local formatMoney function defined (not destructured) — import from @/lib/currency" \
  'function formatMoney\b' \
  '^\s*//'

# ── HARD: new Intl.NumberFormat outside canonical modules ─────────────────

_scan HARD "CURRENCY" \
  "new Intl.NumberFormat() outside currency.ts — use canonical formatters" \
  'new Intl\.NumberFormat' \
  '^\s*//'

# ── SOFT: toFixed() — broad check; non-monetary uses are expected ─────────

_scan SOFT "CURRENCY" \
  ".toFixed() — verify each use is non-monetary (%, km, h, KB, MB, ratings, coords)" \
  '\.toFixed\([0-9]\)' \
  '^\s*//' \
  '%' \
  ' km' \
  ' MB' \
  ' GB' \
  ' KB' \
  '\.toFixed\(1\)h' \
  '\.toFixed\(5\)' \
  'rating' \
  'pct' \
  'Pct' \
  'Rate' \
  'rate\.' \
  'growth' \
  'utilization' \
  'retention' \
  'cancel' \
  'resolution' \
  'appointments\/' \
  'sessions\/'

# ── SUMMARY ────────────────────────────────────────────────────────────────

echo -e "${BLD}═══════════════════════════════════════════════════════${RST}"
printf "Hard violations : %d\n" "$HARD_VIOLATIONS"
printf "Soft advisories : %d\n" "$SOFT_WARNINGS"
echo -e "${BLD}═══════════════════════════════════════════════════════${RST}"

if [[ $HARD_VIOLATIONS -eq 0 ]]; then
  echo -e "${GRN}${BLD}✔  Zero hard violations — system is compliant.${RST}"
  [[ $SOFT_WARNINGS -gt 0 ]] && \
    echo -e "${CYN}ℹ  ${SOFT_WARNINGS} soft advisory match(es) — confirm each is non-monetary.${RST}"
  echo -e "${BLD}═══════════════════════════════════════════════════════${RST}"
  exit 0
else
  echo -e "${RED}${BLD}✘  ${HARD_VIOLATIONS} hard violation(s) — fix before merging.${RST}"
  echo -e "   Remediation helpers: client/src/lib/strict-enforcer/index.ts"
  echo -e "${BLD}═══════════════════════════════════════════════════════${RST}"
  if [[ "$WARN_ONLY" == "true" ]]; then
    echo -e "${YEL}(--warn-only: exiting 0)${RST}"
    exit 0
  fi
  exit 1
fi
