// Source of the pytest plugin the runner gives pytest, the Python counterpart of nodeTestReporter.ts.
// pytest has no built-in JSON report and the validator adds no dependencies, so the runner writes
// this text to /patches/hecate_pytest_reporter.py and loads it with `-p hecate_pytest_reporter`
// (PYTHONPATH includes /patches). It writes the same {id: status} JSON as the node --test reporter to
// the path in $REPORT, so one parser reads both:
//   - id: absolute path of the test file + "::" + the rest of pytest's nodeid (`Class::test`,
//     parameters as pytest prints them); the parser strips the /work/ mount prefix.
//   - status from every phase: failed if setup, call or teardown failed (errors count as failed),
//     else skipped if any phase skipped (an xfail arrives as skipped), else passed.
//   - a file that fails to collect (import or syntax error) is `<file>::(load)` = failed, the same
//     pseudo-id the other runners produce. A collection error below the file (a bad parametrize)
//     marks that node failed instead.
// Each failure's id and short message are printed to stderr so a run log explains itself.
// Standard library only; works on pytest 7 and 8. Kept as a string so it ships with the dashboard code.

export const PYTEST_REPORTER_MODULE = "hecate_pytest_reporter";

export const PYTEST_REPORTER_SOURCE = String.raw`"""Hecate validator: writes {test id: status} JSON to $REPORT. Generated; see pytestReporter.ts."""
import json
import os
import sys

_RANK = {"passed": 0, "skipped": 1, "failed": 2}


def _short(report):
    crash = getattr(report.longrepr, "reprcrash", None)
    if crash is not None and getattr(crash, "message", None):
        return str(crash.message)
    lines = [line for line in str(report.longrepr or "").splitlines() if line.strip()]
    errors = [line for line in lines if line.startswith("E ")]
    return (errors or lines or [""])[-1]


class HecateReporter:
    def __init__(self, config):
        self.config = config
        root = getattr(config, "rootpath", None) or config.rootdir
        self.root = str(root)
        self.results = {}
        self.messages = {}

    def _id(self, nodeid):
        file, sep, rest = nodeid.partition("::")
        path = os.path.normpath(os.path.join(self.root, file)) if file else self.root
        return path + "::" + rest if sep else path

    def _record(self, key, status, report):
        if key not in self.results or _RANK[status] > _RANK[self.results[key]]:
            self.results[key] = status
        if status == "failed" and key not in self.messages:
            self.messages[key] = _short(report)

    def pytest_runtest_logreport(self, report):
        status = "failed" if report.failed else "skipped" if report.skipped else "passed"
        self._record(self._id(report.nodeid), status, report)

    def pytest_collectreport(self, report):
        if not report.failed:
            return
        key = self._id(report.nodeid)
        if "::" not in report.nodeid:
            key += "::(load)"
        self._record(key, "failed", report)

    def pytest_sessionfinish(self, session):
        if hasattr(self.config, "workerinput"):
            return  # an xdist worker; the controller writes the report
        out = os.environ.get("REPORT", "report.json")
        for key, message in self.messages.items():
            sys.stderr.write("[hecate] FAIL " + key + "\n" + "\n".join("    " + l for l in message.splitlines()) + "\n")
        sys.stderr.write("[hecate] " + str(len(self.results)) + " test results written to " + out + "\n")
        with open(out, "w") as f:
            json.dump(self.results, f, indent=2, sort_keys=True)


def pytest_configure(config):
    config.pluginmanager.register(HecateReporter(config), "hecate-reporter")
`;
