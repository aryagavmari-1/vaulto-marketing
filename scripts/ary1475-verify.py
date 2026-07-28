#!/usr/bin/env python3
"""ARY-1475 — gate the homepage trust-band C-002 bullet against the approved /security clause.

`src/i18n/content/home/<loc>.json` -> `trustBand.proof[3]` must be the approved
C-002 isolation clause, lifted verbatim from
`src/i18n/content/security/<loc>.json` -> `protections[-1].body` with its terminal
punctuation removed. Nothing here is re-translated; the gate is byte identity, so a
locale that was re-worded fails even when it says the same thing.

Usage:
    python3 scripts/ary1475-verify.py            # working tree
    REV=origin/master python3 scripts/ary1475-verify.py   # non-vacuity control

Both the value under test and its reference are read at the SAME rev on purpose:
that is what makes REV=origin/master a real control. It is also the trap that made
the ARY-1384 run self-report 16/16 on a base 16 commits stale — so the gate prints
the rev and, in working-tree mode, refuses to run when HEAD is behind origin/master.

Checks, per locale:
  IDENTITY      proof[3] == security protections[-1].body minus terminal punctuation
  RETIRED       the ARY-1373 absolute ("only ... ever ... see your own") is gone
  UNPUNCTUATED  proof[3] carries no terminal punctuation, and neither do its siblings

TERMINAL_PUNCT deliberately includes the Devanagari danda and the Arabic full stop —
an ASCII-only set passes a stray danda in `hi` silently.
"""

import json
import os
import subprocess
import sys

LOCALES = ["ar", "de", "en", "es", "fr", "hi", "it", "ja",
           "ko", "nl", "pl", "pt", "ru", "sv", "tr", "zh"]

# Sentence-final marks across the 16 shipped locales, not just ASCII.
TERMINAL_PUNCT = ".。．।۔!！?？"

PROOF_INDEX = 3
REV = os.environ.get("REV", "").strip()


def read_json(path):
    if REV:
        out = subprocess.run(["git", "show", f"{REV}:{path}"],
                             capture_output=True, text=True)
        if out.returncode != 0:
            raise SystemExit(f"cannot read {path} at {REV}: {out.stderr.strip()}")
        return json.loads(out.stdout)
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def staleness_guard():
    """Working-tree mode only: a stale base makes every check compare wrong-to-wrong."""
    if REV:
        return
    subprocess.run(["git", "fetch", "--quiet", "origin"], capture_output=True)
    out = subprocess.run(
        ["git", "rev-list", "--left-right", "--count", "origin/master...HEAD"],
        capture_output=True, text=True)
    if out.returncode != 0:
        print("  ! could not compare against origin/master; continuing")
        return
    behind, ahead = out.stdout.split()
    print(f"  base: {behind} behind / {ahead} ahead of origin/master")
    if int(behind) > 0:
        raise SystemExit(
            f"REFUSING TO RUN: HEAD is {behind} commits behind origin/master.\n"
            "The reference clause is read at the same rev as the value under test, "
            "so a stale base scores against a retired target. Rebase first.")


def main():
    print(f"ARY-1475 trust-band C-002 gate — rev: {REV or 'working tree'}")
    staleness_guard()

    failures = []
    for loc in LOCALES:
        home = read_json(f"src/i18n/content/home/{loc}.json")
        security = read_json(f"src/i18n/content/security/{loc}.json")

        proof = home["trustBand"]["proof"]
        value = proof[PROOF_INDEX]
        approved = security["protections"][-1]["body"].rstrip()
        expected = approved.rstrip(TERMINAL_PUNCT).rstrip()

        problems = []
        if value != expected:
            problems.append(f"IDENTITY (want {expected!r}, got {value!r})")
        # Name the ARY-1373 absolute when it survives, rather than only reporting
        # "not byte-identical" — the two failures want different fixes.
        retired = subprocess.run(
            ["git", "show", f"origin/master:src/i18n/content/home/{loc}.json"],
            capture_output=True, text=True)
        if retired.returncode == 0:
            old = json.loads(retired.stdout)["trustBand"]["proof"][PROOF_INDEX]
            if value == old and old != expected:
                problems.append("RETIRED (still the ARY-1373 absolute)")
        for i, sibling in enumerate(proof):
            if sibling and sibling[-1] in TERMINAL_PUNCT:
                problems.append(f"UNPUNCTUATED (proof[{i}] ends {sibling[-1]!r})")

        if problems:
            failures.append(loc)
            print(f"  {loc}  FAIL  " + "; ".join(problems))
        else:
            print(f"  {loc}  PASS  {value}")

    passed = len(LOCALES) - len(failures)
    print(f"\n  {passed}/{len(LOCALES)} PASS · {len(failures)}/{len(LOCALES)} FAIL")
    if failures:
        print(f"  ✗ gate FAILED: {', '.join(failures)}")
        return 1
    print("  ✓ gate PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
