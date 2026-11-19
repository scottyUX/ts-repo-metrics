#!/bin/bash
# Verifier: add the task's tests, run the suite the way the validator did, grade against expected.json.
mkdir -p /logs/verifier
cd /app
git apply --whitespace=nowarn /tests/test.diff || { echo 'test patch did not apply' >&2; echo 0 > /logs/verifier/reward.txt; exit 0; }
cd /app && (pip install -r backend/requirements.txt) || true
cd /app && (pip install pytest) || true
cd /app
bash -eo pipefail -c 'cd backend
alembic upgrade head' || echo 'schema step failed' >&2
mkdir -p /tests/reports
export REPORT_DIR=/tests/reports
cd /app/backend
PYTHONPATH=/tests/pytest_plugin REPORT=$REPORT_DIR/pytest-0.json python -m pytest -p hecate_pytest_reporter -p no:cacheprovider --continue-on-collection-errors || true
python3 /tests/check.py /tests/expected.json /tests/reports /app/ /logs/verifier/reward.txt > /logs/verifier/summary.txt 2>&1
cat /logs/verifier/summary.txt
