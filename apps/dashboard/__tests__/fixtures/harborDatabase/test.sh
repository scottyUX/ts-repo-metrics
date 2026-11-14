#!/bin/bash
# Verifier: add the task's tests, run the suite the way the validator did, grade against expected.json.
mkdir -p /logs/verifier
cd /app
git apply --whitespace=nowarn /tests/test.diff || { echo 'test patch did not apply' >&2; echo 0 > /logs/verifier/reward.txt; exit 0; }
cd /app && (corepack enable && pnpm install --frozen-lockfile) || true
cd /app/server && (corepack enable && pnpm install --frozen-lockfile) || true
cd /app
bash -eo pipefail -c '(
  cd server
  pnpm db:push
)' || echo 'schema step failed' >&2
mkdir -p /tests/reports
export REPORT_DIR=/tests/reports
cd /app/server
REPORT=$REPORT_DIR/node-0.json node --test --test-reporter=/tests/reporter.mjs "backend_tests/*.test.ts" || true
node /tests/check.mjs /tests/expected.json /tests/reports /app/ /logs/verifier/reward.txt > /logs/verifier/summary.txt 2>&1
cat /logs/verifier/summary.txt
