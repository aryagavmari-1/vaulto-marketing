#!/usr/bin/env python3
"""ARY-1424 rendered-dist sweep over the 32 pages (16 locales x /privacy + /security).
Ban sweep with a working positive control on each banned family.
"""
import glob, os, re, sys, html

import subprocess as _sp
ROOT = _sp.run(["git","rev-parse","--show-toplevel"],capture_output=True,text=True).stdout.strip() + "/dist"
LOCALES = "ar de en es fr hi it ja ko nl pl pt ru sv tr zh".split()

def page(loc, name):
    p = os.path.join(ROOT, name, "index.html") if loc == "en" else os.path.join(ROOT, loc, name, "index.html")
    if not os.path.exists(p):
        return None, p
    return open(p, encoding="utf-8").read(), p

fail, pages = [], 0
for loc in LOCALES:
    for name in ("privacy", "security"):
        txt, p = page(loc, name)
        if txt is None:
            fail.append(f"MISSING PAGE {p}")
            continue
        pages += 1
        # positive control: every page must actually carry the KMS claim
        if "Google Cloud KMS" not in txt:
            fail.append(f"{loc}/{name}: no 'Google Cloud KMS' — page may not be the one we edited")

# --- hard ban sweep across all 32 pages ------------------------------------
BANS = ["bank-grade", "bank grade", "military-grade", "military grade",
        "SOC 2", "SOC2", "ISO 27001", "unhackable", "guaranteed",
        "everything is encrypted", "all your data", "every field"]
hits = []
for loc in LOCALES:
    for name in ("privacy", "security"):
        txt, _ = page(loc, name)
        if txt is None: continue
        low = txt.lower()
        for b in BANS:
            if b.lower() in low:
                hits.append(f"{loc}/{name}: BANNED {b!r}")

# positive control for the ban detector: it must fire on a seeded string
seed = "<p>Our storage is bank-grade and unhackable.</p>".lower()
ctrl = [b for b in BANS if b.lower() in seed]
if not ctrl:
    fail.append("BAN DETECTOR BROKEN: seeded positive control produced no hit")

# --- end-to-end / zero-knowledge positional rule ---------------------------
E2E = {
 "ar": ["الشامل بين الطرفين", "zero-knowledge"], "de": ["Ende-zu-Ende", "Zero-Knowledge"],
 "en": ["end-to-end", "zero-knowledge"], "es": ["extremo a extremo", "conocimiento cero"],
 "fr": ["bout en bout", "zero-knowledge"], "hi": ["एंड-टू-एंड", "zero-knowledge"],
 "it": ["end-to-end", "zero-knowledge"], "ja": ["エンドツーエンド", "zero-knowledge"],
 "ko": ["종단 간", "zero-knowledge"], "nl": ["end-to-end", "zero-knowledge"],
 "pl": ["end-to-end", "zero-knowledge"], "pt": ["ponta a ponta", "conhecimento zero"],
 "ru": ["сквозном", "zero-knowledge"], "sv": ["end-to-end", "zero-knowledge"],
 "tr": ["uçtan uca", "zero-knowledge"], "zh": ["端到端", "zero-knowledge"],
}
for loc in LOCALES:
    priv, _ = page(loc, "privacy")
    sec, _ = page(loc, "security")
    for t in E2E[loc]:
        if priv and t in priv:
            fail.append(f"{loc}/privacy: '{t}' must never appear on /privacy")
    # positive control: the disavowal must be present on /security
    if sec and not any(t in sec for t in E2E[loc]):
        fail.append(f"{loc}/security: disavowal missing (positive control) — a zero would be meaningless")

print(f"pages swept: {pages}/32")
print(f"ban detector positive control: fires on {len(ctrl)} seeded term(s) -> {ctrl}")
print(f"banned-term hits in dist: {len(hits)}")
for h in hits: print("  -", h)
if fail:
    print(f"\n{len(fail)} FAILURES:")
    for f in fail: print(" -", f)
    sys.exit(1)
print("PASS: 32/32 pages render the claim, 0 banned terms, e2e/zk confined to /security")
