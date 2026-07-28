#!/usr/bin/env python3
"""ARY-1424 verifier. Independent of the apply script's replacement table:
checks the STRUCTURE of the result, plus regression controls.

Positive controls are included so a zero can never be a fetch failure.
"""
import json, os, re, sys

import subprocess as _sp
ROOT = _sp.run(["git","rev-parse","--show-toplevel"],capture_output=True,text=True).stdout.strip()
LOCALES = "ar de en es fr hi it ja ko nl pl pt ru sv tr zh".split()

# sentence terminators across the 16 locales
TERM = re.compile(r"[.。।!?]|۔")

fail = []
def check(cond, msg):
    if not cond:
        fail.append(msg)

# tokens that must NOT survive: the categorical seal openers, per locale
CATEGORICAL = {
 "ar": ["النص الحر", "التفاصيل التي تكتبها"],
 "de": ["Freitext", "die Angaben, die du eintippst"],
 "en": ["free text you write", "the details you type"],
 "es": ["texto libre", "los datos que escribes"],
 "fr": ["texte libre", "les informations que vous saisissez"],
 "hi": ["मुक्त पाठ", "आपके लिखे विवरण"],
 "it": ["testo libero", "i dettagli che digiti"],
 "ja": ["自由記述", "あなたが入力する詳細"],
 "ko": ["자유 텍스트", "입력하는 세부 정보"],
 "nl": ["vrije tekst", "de gegevens die je typt"],
 "pl": ["swobodny tekst", "szczegóły, które wpisujesz"],
 "pt": ["texto livre", "os detalhes que você digita"],
 "ru": ["свободный текст", "детали, которые вы вводите"],
 "sv": ["fria text", "de uppgifter du skriver in"],
 "tr": ["serbest metin", "yazdığınız ayrıntılar"],
 "zh": ["自由文本", "你填写的细节"],
}

# belongsTo must be named in the readable list
BELONGS = {
 "ar": "لمن يعود الغرض", "de": "wem ein Gegenstand gehört", "en": "who an item belongs to",
 "es": "a quién pertenece un objeto", "fr": "à qui appartient un objet",
 "hi": "कोई वस्तु किसकी है", "it": "a chi appartiene un oggetto",
 "ja": "その品物が誰のものか", "ko": "해당 물품이 누구의 것인지",
 "nl": "van wie een voorwerp is", "pl": "do kogo należy dany przedmiot",
 "pt": "a quem um item pertence", "ru": "кому принадлежит вещь",
 "sv": "vem ett föremål tillhör", "tr": "bir eşyanın kime ait olduğu",
 "zh": "某件物品属于谁",
}

# the /privacy closing pointer must now name the field split
READABLE_PTR = {
 "ar": "الحقول التي تظل مقروءة", "de": "welche Felder lesbar bleiben",
 "en": "which fields stay readable", "es": "qué campos siguen siendo legibles",
 "fr": "quels champs restent lisibles", "hi": "कौन-से फ़ील्ड पठनीय रहते हैं",
 "it": "quali campi restano leggibili", "ja": "どの項目が読み取れるまま残るか",
 "ko": "어떤 항목이 읽을 수 있는 상태로 남는지", "nl": "welke velden leesbaar blijven",
 "pl": "które pola pozostają czytelne", "pt": "que campos continuam legíveis",
 "ru": "какие поля остаются читаемыми", "sv": "vilka fält som förblir läsbara",
 "tr": "hangi alanların okunabilir kaldığı", "zh": "哪些字段仍可读取",
}

import subprocess

def load(kind, loc, rev=None):
    path = f"src/i18n/content/{kind}/{loc}.json"
    if rev:
        raw = subprocess.run(["git", "-C", ROOT, "show", f"{rev}:{path}"],
                             capture_output=True, text=True, check=True).stdout
        return json.loads(raw)
    return json.load(open(os.path.join(ROOT, path), encoding="utf-8"))


REV = os.environ.get("ARY1424_REV") or None
# base ref the drift control (A5) diffs against
BASE_DRIFT = os.environ.get("ARY1424_BASE", "1d6cbe4")

for loc in LOCALES:
    P = load("privacy", loc, REV)
    S = load("security", loc, REV)
    pb = P["sections"][4]["body"]
    hb = S["honesty"]["body"]
    p1 = S["protections"][1]["body"]

    # --- A1: LAYER RULE. KMS must not sit in the wholesale opening sentence.
    first = TERM.split(pb)[0]
    check("KMS" not in first, f"{loc}/privacy: KMS still in the wholesale opening sentence")
    check("KMS" in pb, f"{loc}/privacy: KMS missing entirely (positive control)")
    # the app layer must be attributed to the app, and precede the KMS mention
    check("Vaulto" in pb, f"{loc}/privacy: no app-layer attribution")
    check("Vaulto" in pb and "Google Cloud KMS" in pb
          and pb.index("Vaulto") < pb.index("Google Cloud KMS"),
          f"{loc}/privacy: KMS not preceded by the app-layer sentence")
    # --- A1 regression control: ARY-1264 isolation + scrypt wording survives
    check("scrypt" in pb, f"{loc}/privacy: scrypt wording lost")
    check('href="/security/"' in pb, f"{loc}/privacy: security link lost")
    check(READABLE_PTR[loc] in pb, f"{loc}/privacy: closing pointer missing the field split")

    # --- A2 + A3: categorical seal openers gone from both fields
    for token in CATEGORICAL[loc]:
        check(token not in hb, f"{loc}/honesty: categorical opener still present: {token!r}")
        check(token not in p1, f"{loc}/protections[1]: categorical opener still present: {token!r}")

    # --- A4: belongsTo named in the readable list
    check(BELONGS[loc] in hb, f"{loc}/honesty: belongsTo not named in the readable list")

    # --- A3 regression control: do not touch the two-layer opener
    check("Vaulto" in p1, f"{loc}/protections[1]: app-layer attribution lost")
    check("Google Cloud KMS" in p1, f"{loc}/protections[1]: KMS naming lost")

    # --- keep-verbatim control: the we-hold-the-keys reason survives
    check(len(hb) > 400, f"{loc}/honesty: body suspiciously short")

    # --- A5: NO UNINTENDED DRIFT. Language-free, and the only control here that
    # can fail on a field nobody thought to tokenise. A 32-file copy pass is
    # exactly where an unrelated string gets nudged in transit, and the reviewer
    # would have to re-read 32 files to notice. Every field outside the three in
    # scope must be byte-identical to BASE. Skipped when checking BASE itself.
    if REV != BASE_DRIFT:
        for kind, doc, allowed in (("privacy", P, {("sections", 4, "body")}),
                                   ("security", S, {("honesty", "body"), ("protections", 1, "body")})):
            old = load(kind, loc, BASE_DRIFT)
            def walk(a, b, path):
                if tuple(path) in allowed:
                    return
                if isinstance(a, dict):
                    for k in a:
                        walk(a[k], (b or {}).get(k), path + [k])
                elif isinstance(a, list):
                    for i, v in enumerate(a):
                        walk(v, (b or [None] * (i + 1))[i] if b and i < len(b) else None, path + [i])
                elif a != b:
                    fail.append(f"{loc}/{kind}: {'.'.join(map(str, path))} drifted but is "
                                f"not in scope for this pass")
            walk(old, doc, [])
        # the ARY-1264 isolation + scrypt clause must survive VERBATIM, not merely
        # leave the token "scrypt" somewhere in a rewritten sentence
        old_pb = load("privacy", loc, BASE_DRIFT)["sections"][4]["body"]
        clause = next((s.strip() for s in TERM.split(old_pb) if "scrypt" in s), None)
        check(clause and clause in pb,
              f"{loc}/privacy: ARY-1264 isolation + scrypt clause not preserved verbatim")

print(f"locales checked: {len(LOCALES)} (rev={REV or 'working tree'})")
if fail:
    print(f"\n{len(fail)} FAILURES:")
    for f in fail: print(" -", f)
    sys.exit(1)
print("PASS: all four amendments verified 16/16, regression controls intact")
