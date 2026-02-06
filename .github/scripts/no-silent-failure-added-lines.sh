#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${1:-}"
if [[ -z "${BASE_SHA}" ]]; then
  echo "Usage: $0 <base-sha>"
  exit 2
fi

if ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  echo "Base SHA not found: ${BASE_SHA}"
  exit 2
fi

DIFF="$(git diff --unified=0 "${BASE_SHA}"...HEAD -- . ':(exclude)package-lock.json' || true)"

if [[ -z "${DIFF}" ]]; then
  echo "No diff to validate."
  exit 0
fi

fail=0

while IFS= read -r line; do
  [[ "${line}" =~ ^\+\+\+ ]] && continue
  [[ "${line}" =~ ^\+ ]] || continue

  if echo "${line}" | grep -Eq "catch[[:space:]]*\\{[[:space:]]*\\}" || \
     echo "${line}" | grep -Eq "catch[[:space:]]*\\([^)]*\\)[[:space:]]*\\{[[:space:]]*\\}"; then
    echo "Blocked silent failure pattern (empty catch): ${line}"
    fail=1
  fi

  if echo "${line}" | grep -Eq "\\.catch\\([[:space:]]*\\(\\)[[:space:]]*=>[[:space:]]*\\{[[:space:]]*\\}[[:space:]]*\\)" || \
     echo "${line}" | grep -Eq "\\.catch\\([[:space:]]*function[[:space:]]*\\([^)]*\\)[[:space:]]*\\{[[:space:]]*\\}[[:space:]]*\\)"; then
    echo "Blocked silent failure pattern (swallowed promise rejection): ${line}"
    fail=1
  fi
done <<< "${DIFF}"

if [[ "${fail}" -ne 0 ]]; then
  echo "No-silent-failure guard failed."
  exit 1
fi

echo "No-silent-failure guard passed."
