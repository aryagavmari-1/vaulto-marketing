#!/usr/bin/env python3
"""ARY-1316 live sweep: the done-means for the encryption-at-rest claim.

Fetches the 32 live pages (16 locales x /privacy + /security) and proves the
deployed site carries exactly the copy in this commit.

DESIGN NOTE — why this script hand-types almost no locale strings:
  Hand-transcribing non-Latin copy corrupts silently (a missing nukta in
  Hindi's "ख़रीद मूल्य" reads as a clean MISSING). So the expected clause text
  is DERIVED from the source JSON, and the two banned-token tables are IMPORTED
  from the sibling verifiers that already validated them with negative controls.

  The proof chain is:
    source clause is correct   <- ary1322-verify.mjs + ary1424-verify.py
    live page == source clause <- this script
    => the live page is correct.

  This script therefore asserts equality against source rather than
  re-litigating the copy, plus the page-wide bans that source checks can't see.

  python3 scripts/ary1316-live-sweep.py            # live
  python3 scripts/ary1316-live-sweep.py --dist     # local dist/
  python3 scripts/ary1316-live-sweep.py --self-test  # prove each gate fires
"""
import html
import json
import os
import re
import sys
import subprocess as sp
import urllib.request

LOCALES = "ar de en es fr hi it ja ko nl pl pt ru sv tr zh".split()
BASE = "https://myvaulto.com"
ROOT = sp.run(["git", "rev-parse", "--show-toplevel"],
              capture_output=True, text=True).stdout.strip()

# Terms that must NEVER appear on either page, in any locale. These are
# page-wide by nature (a marketing overclaim anywhere on the page is a defect),
# and they are ASCII, so hand-listing them is safe.
BANS = ["bank-grade", "bank grade", "military-grade", "military grade",
        "SOC 2", "SOC2", "ISO 27001", "unhackable", "guaranteed",
        "everything is encrypted", "all your data", "every field"]

# The retired signed-links clause. The nl/privacy "ondertekende Data Processing
# Addendum" is an EXECUTED DPA, not a signed link — requiring "link" adjacency
# keeps that known false positive out of the sweep.
SIGNED_LINKS = ["signed link", "ondertekende link", "signierter link",
                "enlace firmado", "lien signé", "签名链接"]

TAGS = re.compile(r"<[^>]+>")
WS = re.compile(r"\s+")


def plain(s):
    """Render-normalise: drop tags, unescape entities, collapse whitespace."""
    return WS.sub(" ", html.unescape(TAGS.sub("", html.unescape(s)))).strip()


def load_e2e():
    """Import the e2e/zk table from the sibling sweep rather than retyping it."""
    src = open(os.path.join(ROOT, "scripts", "ary1424-dist-sweep.py"),
               encoding="utf-8").read()
    m = re.search(r"^E2E = \{(.*?)^\}", src, re.S | re.M)
    if not m:
        sys.exit("FATAL: could not import E2E table from ary1424-dist-sweep.py")
    return eval("{" + m.group(1) + "}")


def load_categorical():
    """Import the categorical-opener table from the ARY-1424 source verifier."""
    src = open(os.path.join(ROOT, "scripts", "ary1424-verify.py"),
               encoding="utf-8").read()
    m = re.search(r"^CATEGORICAL = \{(.*?)^\}", src, re.S | re.M)
    if not m:
        sys.exit("FATAL: could not import CATEGORICAL table from ary1424-verify.py")
    return eval("{" + m.group(1) + "}")


E2E = load_e2e()
CATEGORICAL = load_categorical()


def clauses(loc):
    """The three clauses this issue ships, straight from source. These are the
    ground truth the live page must reproduce verbatim."""
    sec = json.load(open(f"{ROOT}/src/i18n/content/security/{loc}.json",
                         encoding="utf-8"))
    priv = json.load(open(f"{ROOT}/src/i18n/content/privacy/{loc}.json",
                          encoding="utf-8"))
    return {
        ("security", "honesty.body"): plain(sec["honesty"]["body"]),
        ("security", "protections[1].body"): plain(sec["protections"][1]["body"]),
        ("privacy", "sections[4].body"): plain(priv["sections"][4]["body"]),
    }


def fetch_live(loc, name):
    path = f"/{name}/" if loc == "en" else f"/{loc}/{name}/"
    req = urllib.request.Request(BASE + path,
                                 headers={"User-Agent": "ary1316-sweep"})
    # urllib follows redirects by default — the curl -L equivalent, so the
    # www->apex hop cannot fake a pass.
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def fetch_dist(loc, name):
    p = (os.path.join(ROOT, "dist", name, "index.html") if loc == "en"
         else os.path.join(ROOT, "dist", loc, name, "index.html"))
    return open(p, encoding="utf-8").read()


def run(fetch, mutate=None):
    fail, rows = [], []
    pages = {}
    for loc in LOCALES:
        for name in ("privacy", "security"):
            try:
                txt = fetch(loc, name)
            except Exception as e:
                fail.append(f"{loc}/{name}: FETCH FAILED {e}")
                continue
            pages[(loc, name)] = mutate(loc, name, txt) if mutate else txt

    for loc in LOCALES:
        priv, sec = pages.get((loc, "privacy")), pages.get((loc, "security"))
        if priv is None or sec is None:
            continue
        flat = {"privacy": plain(priv), "security": plain(sec)}
        low = {k: v.lower() for k, v in flat.items()}

        # --- 1. live == source, per clause -----------------------------------
        # This is the strongest positive control available: it proves the page
        # is THIS commit's copy, so every zero below means real absence.
        clause_ok = 0
        for (page, field), expected in clauses(loc).items():
            if expected in flat[page]:
                clause_ok += 1
            else:
                fail.append(f"{loc}/{page}: {field} does NOT match source "
                            f"— live copy is stale or altered")

        # --- 2. categorical opener, scoped TO THE CLAUSE ---------------------
        # Page-wide would false-positive: de/privacy legitimately says
        # "Freitextnotizen" in the unrelated data-collection disclosure.
        for (page, field), expected in clauses(loc).items():
            el = expected.lower()
            for c in CATEGORICAL[loc]:
                if c.lower() in el:
                    fail.append(f"{loc}/{page}: categorical seal opener "
                                f"{c!r} in {field}")

        # --- 3. named positive controls --------------------------------------
        kms_p = low["privacy"].count("google cloud kms")
        kms_s = low["security"].count("google cloud kms")
        scrypt = low["privacy"].count("scrypt")
        if kms_p < 1:
            fail.append(f"{loc}/privacy: 'Google Cloud KMS' MISSING")
        if kms_s < 1:
            fail.append(f"{loc}/security: 'Google Cloud KMS' MISSING")
        if scrypt < 1:
            fail.append(f"{loc}/privacy: 'scrypt' MISSING (ARY-784 control)")

        # --- 4. page-wide hard bans ------------------------------------------
        for page in ("privacy", "security"):
            for b in BANS:
                if b.lower() in low[page]:
                    fail.append(f"{loc}/{page}: BANNED {b!r}")
            for s in SIGNED_LINKS:
                if s.lower() in low[page]:
                    fail.append(f"{loc}/{page}: retired signed-links clause {s!r}")

        # --- 5. e2e/zk: banned on /privacy, REQUIRED on /security ------------
        for t in E2E[loc]:
            if t.lower() in low["privacy"]:
                fail.append(f"{loc}/privacy: {t!r} must never appear on /privacy")
        if not any(t.lower() in low["security"] for t in E2E[loc]):
            fail.append(f"{loc}/security: e2e/zk disavowal MISSING "
                        f"— a /privacy zero would be meaningless")

        rows.append((loc, clause_ok, kms_p, kms_s, scrypt))
    return fail, rows


def self_test():
    """Prove each gate family fires INDEPENDENTLY. Baseline must be clean first,
    else an early failure masks every later seed (ARY-1371)."""
    base, _ = run(fetch_dist)
    if base:
        print("SELF-TEST ABORTED — baseline is not clean, seeds would be masked:")
        for f in base:
            print("  -", f)
        return 1
    print("baseline clean; seeding one defect per gate family\n")
    seeds = [
        ("ban", lambda l, n, t: t + "<p>bank-grade security</p>"
         if (l, n) == ("de", "security") else t),
        ("signed-links", lambda l, n, t: t + "<p>signed link</p>"
         if (l, n) == ("nl", "privacy") else t),
        ("e2e-on-privacy", lambda l, n, t: t + "<p>bout en bout</p>"
         if (l, n) == ("fr", "privacy") else t),
        ("e2e-disavowal-gone", lambda l, n, t: re.sub(
            "end-to-end|zero-knowledge", "XX", t, flags=re.I)
         if (l, n) == ("en", "security") else t),
        ("kms-gone", lambda l, n, t: t.replace("Google Cloud KMS", "XX")
         if (l, n) == ("ja", "privacy") else t),
        ("scrypt-gone", lambda l, n, t: re.sub("scrypt", "XX", t, flags=re.I)
         if (l, n) == ("ko", "privacy") else t),
        ("clause-drift", lambda l, n, t: t.replace("Google Cloud KMS", "Acme KMS")
         if (l, n) == ("es", "security") else t),
    ]
    ok = True
    for label, m in seeds:
        f, _ = run(fetch_dist, m)
        if f:
            print(f"  {label:20s} -> FIRES   [{f[0]}]")
        else:
            print(f"  {label:20s} -> !!! DID NOT FIRE (fail-open)")
            ok = False

    # The categorical gate cannot be seeded through the rendered page (it reads
    # the source clause), so seed it at source level instead.
    real = clauses
    try:
        def poisoned(loc):
            c = real(loc)
            if loc == "de":
                k = ("security", "honesty.body")
                c[k] = c[k].replace("Verschlüsselt:",
                                    "Verschlüsselt: der Freitext, den du schreibst —")
            return c
        globals()["clauses"] = poisoned
        f, _ = run(fetch_dist)
        cat = [x for x in f if "categorical seal opener" in x]
        if cat:
            print(f"  {'categorical':20s} -> FIRES   [{cat[0]}]")
        else:
            print(f"  {'categorical':20s} -> !!! DID NOT FIRE (fail-open)")
            ok = False
    finally:
        globals()["clauses"] = real

    print("\nSELF-TEST PASS" if ok else "\nSELF-TEST FAILED — a gate is fail-open")
    return 0 if ok else 1


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    use_dist = "--dist" in sys.argv
    print(f"ARY-1316 sweep against {'dist/' if use_dist else BASE} — 32 pages\n")
    fail, rows = run(fetch_dist if use_dist else fetch_live)
    print(f"{'loc':4} {'clauses':>8} {'priv:KMS':>9} {'sec:KMS':>8} {'priv:scrypt':>12}")
    for loc, co, kp, ks, sc in rows:
        print(f"{loc:4} {str(co) + '/3':>8} {kp:>9} {ks:>8} {sc:>12}")
    print(f"\npages swept: {len(rows) * 2}/32")
    if fail:
        print(f"\n{len(fail)} FAILURES:")
        for f in fail:
            print(" -", f)
        sys.exit(1)
    print("\nPASS: 48/48 clauses match source verbatim, KMS 16/16 both pages,\n"
          "      scrypt 16/16 /privacy, 0 banned terms, 0 categorical openers,\n"
          "      e2e/zk confined to /security.")
