#!/usr/bin/env bash
# UI regression suite (Playwright for Python + Chromium). Start a server first:
#   node scripts/local-server.mjs 8799 &      (or set ESTIMO_URL to another environment)
# Some tests use test/ui/bots.mjs (Node 22+) to seat extra voters.
set -u
cd "$(dirname "$0")"
mkdir -p shots
status=0
for t in e2e fit homefit pager del cards seasonal season2 appfeel press pop; do
  out=$(python3 "$t.py" 2>&1)
  if echo "$out" | grep -qE "Traceback|AssertionError| FAIL|ALL FIT: False|ALL OK: False"; then echo "✗ $t"; echo "$out" | tail -5; status=1; else echo "✓ $t"; fi
done
exit $status
