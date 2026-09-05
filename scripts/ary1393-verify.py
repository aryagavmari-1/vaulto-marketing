#!/usr/bin/env python3
"""ARY-1393 / ARY-1481 — verify the /security support-access clause in all 16 locales.

The clause appended to protections[-1] on /security is a two-legged ABSENCE claim:

  Leg A (C-025 headline)  our support team cannot browse your vault
  Leg B                   no staff account type that could open one

An earlier draft (ARY-1445 copy table) also carried a third leg —
"Vaulto has no admin or support view" — which ARY-1444's countersign REFUTED
in every locale: three staff-authenticated read surfaces are live in production
(GET /api/analytics/{funnel,dashboard}, /api/feedback/{metrics,dashboard},
/api/client-errors/recent, all token-gated; /api/analytics/dashboard even
answers with a Basic-auth realm "Vaulto Board Analytics"). ARY-1481 is the
rework that DROPS that refuted leg while keeping Leg A + Leg B.

This checker asserts, per locale and without keyword-guessing the whole segment:
  1. the localised isolation clause (baseline) still opens the body verbatim;
  2. the appended segment is present (body strictly longer than the baseline);
  3. the SURVIVOR marker (staff-account leg) is present;
  4. the REFUTED marker (admin/support-view leg) is ABSENT.

Modes:
  (default)          verify the working tree — expect 16/16 pass.
  --apply            write the reworked bodies into the JSON files.
  --control baseline positive control: run against origin/master baseline
                     (no segment) — expect 16/16 FAIL on check 2/3.
  --control refuted  negative control: run against the pre-ARY-1481 bodies
                     (with the admin/support-view leg) — expect 16/16 FAIL on
                     check 4. Proves the refuted-absence check is non-vacuous.
"""
import json, io, os, sys

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "..", "src", "i18n", "content", "security")

# The localised isolation clause each body must still open with (verbatim prefix).
PREFIX = {
"en": "Each person's vault is isolated from other users",
"de": "Der Tresor jeder Person ist von anderen Nutzern isoliert",
"es": "La bóveda de cada persona está aislada de los demás usuarios",
"fr": "Le coffre-fort de chaque personne est isolé des autres utilisateurs",
"it": "La cassaforte di ogni persona è isolata dagli altri utenti",
"nl": "De kluis van elke persoon is geïsoleerd van andere gebruikers",
"pl": "Sejf każdej osoby jest odizolowany od innych użytkowników",
"pt": "O cofre de cada pessoa está isolado dos outros utilizadores",
"ru": "Сейф каждого пользователя изолирован от других пользователей",
"sv": "Varje persons valv är isolerat från andra användare",
"tr": "Her kişinin kasası diğer kullanıcılardan yalıtılmıştır",
"ar": "خزنة كل شخص معزولة عن المستخدمين الآخرين",
"hi": "हर व्यक्ति की तिजोरी दूसरे उपयोगकर्ताओं से अलग रहती है",
"ja": "一人ひとりの金庫は他のユーザーから分離されて",
"ko": "각 사용자의 금고는 다른 사용자와 분리되어 있",
"zh": "每个人的保险库都与其他用户相互隔离",
}

# The reworked bodies: Leg A + Leg B, refuted admin/support-view leg removed and
# each conjunction repaired so exactly one absence remains.
BODIES = {
"en": "Each person's vault is isolated from other users, and our support team cannot browse your vault — Vaulto has no staff account type that could open one.",
"de": "Der Tresor jeder Person ist von anderen Nutzern isoliert, und unser Support-Team kann deinen Tresor nicht einsehen — Vaulto hat keine Mitarbeiter-Kontoart, die einen solchen öffnen könnte.",
"es": "La bóveda de cada persona está aislada de los demás usuarios, y nuestro equipo de soporte no puede consultar tu bóveda: Vaulto no tiene ningún tipo de cuenta de personal que pudiera abrirla.",
"fr": "Le coffre-fort de chaque personne est isolé des autres utilisateurs, et notre équipe d’assistance ne peut pas consulter votre coffre-fort — Vaulto n’a aucun type de compte interne qui permettrait d’en ouvrir un.",
"it": "La cassaforte di ogni persona è isolata dagli altri utenti e il nostro team di assistenza non può consultare la tua cassaforte — Vaulto non ha alcun tipo di account per il personale che possa aprirne una.",
"nl": "De kluis van elke persoon is geïsoleerd van andere gebruikers, en ons supportteam kan je kluis niet inzien — Vaulto heeft geen accounttype voor medewerkers dat er een zou kunnen openen.",
"pl": "Sejf każdej osoby jest odizolowany od innych użytkowników, a nasz zespół wsparcia nie może przeglądać Twojego sejfu — Vaulto nie ma żadnego rodzaju konta dla pracowników, które mogłoby go otworzyć.",
"pt": "O cofre de cada pessoa está isolado dos outros utilizadores e a nossa equipa de apoio não pode consultar o seu cofre — o Vaulto não tem qualquer tipo de conta para funcionários que o pudesse abrir.",
"ru": "Сейф каждого пользователя изолирован от других пользователей, а наша служба поддержки не может просматривать ваш сейф — в Vaulto нет типа учётной записи для сотрудников, который позволил бы его открыть.",
"sv": "Varje persons valv är isolerat från andra användare, och vårt supportteam kan inte se ditt valv — Vaulto har ingen kontotyp för anställda som skulle kunna öppna ett sådant.",
"tr": "Her kişinin kasası diğer kullanıcılardan yalıtılmıştır ve destek ekibimiz kasanızı görüntüleyemez — Vaulto’da kasanızı açabilecek bir çalışan hesabı türü yoktur.",
"ar": "خزنة كل شخص معزولة عن المستخدمين الآخرين، ولا يستطيع فريق الدعم لدينا الاطلاع على خزنتك — لا تتضمّن Vaulto أي نوع من حسابات الموظفين يمكنه فتح واحدة.",
"hi": "हर व्यक्ति की तिजोरी दूसरे उपयोगकर्ताओं से अलग रहती है, और हमारी सहायता टीम आपकी तिजोरी नहीं देख सकती — Vaulto में कर्मचारियों के लिए ऐसा कोई खाता प्रकार नहीं है जो उसे खोल सके।",
"ja": "一人ひとりの金庫は他のユーザーから分離されており、当社のサポートチームがあなたの金庫を閲覧することはできません。Vaulto には、あなたの金庫を開けるような従業員向けのアカウント種別はありません。",
"ko": "각 사용자의 금고는 다른 사용자와 분리되어 있으며, 저희 지원팀은 사용자의 금고를 열람할 수 없습니다. Vaulto에는 사용자의 금고를 열 수 있는 직원용 계정 유형이 없습니다.",
"zh": "每个人的保险库都与其他用户相互隔离，我们的支持团队也无法浏览你的保险库——Vaulto 没有可以打开你的保险库的员工账户类型。",
}

# Leg B — the staff-account survivor. A distinctive substring that must be PRESENT.
SURVIVOR = {
"en": "staff account type",
"de": "Mitarbeiter-Kontoart",
"es": "cuenta de personal",
"fr": "compte interne",
"it": "account per il personale",
"nl": "accounttype voor medewerkers",
"pl": "konta dla pracowników",
"pt": "conta para funcionários",
"ru": "учётной записи для сотрудников",
"sv": "kontotyp för anställda",
"tr": "çalışan hesabı türü",
"ar": "حسابات الموظفين",
"hi": "खाता प्रकार",
"ja": "アカウント種別",
"ko": "계정 유형",
"zh": "员工账户类型",
}

# The refuted admin/support-view leg. A distinctive substring that must be ABSENT.
REFUTED = {
"en": "admin or support view",
"de": "Admin- oder Support-Ansicht",
"es": "vista de administración",
"fr": "vue d’administration",
"it": "vista di amministrazione",
"nl": "beheerders- of supportweergave",
"pl": "widoku administracyjnego",
"pt": "vista de administração",
"ru": "административного интерфейса",
"sv": "admin- eller supportvy",
"tr": "yönetici ya da destek görünümü",
"ar": "واجهة إدارة",
"hi": "एडमिन या सहायता व्यू",
"ja": "管理者用やサポート用の画面",
"ko": "관리자용 화면",
"zh": "管理员视图",
}


def body_of(loc, source):
    """Return protections[-1].body for a locale under the chosen source."""
    if source == "baseline":
        return PREFIX[loc] + ("." if loc not in ("ja", "ko") else "")  # segment-free stand-in
    if source == "refuted":
        # Re-insert the refuted leg to prove check 4 fires (pre-ARY-1481 shape).
        return REFUTED_BODIES[loc]
    path = os.path.join(DIR, f"{loc}.json")
    d = json.loads(io.open(path, encoding="utf-8").read())
    return d["protections"][-1]["body"]


# Pre-ARY-1481 bodies (with the refuted admin/support-view leg) — control only.
REFUTED_BODIES = {
"en": "Each person's vault is isolated from other users, and our support team cannot browse your vault — Vaulto has no admin or support view, and no staff account type that could open one.",
"ar": "خزنة كل شخص معزولة عن المستخدمين الآخرين، ولا يستطيع فريق الدعم لدينا الاطلاع على خزنتك — لا تتضمّن Vaulto أي واجهة إدارة أو واجهة دعم، ولا أي نوع من حسابات الموظفين يمكنه فتح واحدة.",
}


def check(loc, source):
    body = body_of(loc, source)
    prefix = PREFIX[loc]
    errs = []
    if not body.startswith(prefix):
        errs.append("isolation clause missing/altered")
    if len(body) <= len(prefix) + 1:
        errs.append("no appended segment")
    if SURVIVOR[loc] not in body:
        errs.append(f"survivor leg absent (want {SURVIVOR[loc]!r})")
    if REFUTED[loc] in body:
        errs.append(f"REFUTED leg present (found {REFUTED[loc]!r})")
    return errs


def run(source, apply=False):
    fail = 0
    for loc in sorted(BODIES):
        if source == "refuted" and loc not in REFUTED_BODIES:
            continue
        if apply:
            path = os.path.join(DIR, f"{loc}.json")
            raw = io.open(path, encoding="utf-8").read()
            d = json.loads(raw)
            d["protections"][-1]["body"] = BODIES[loc]
            trailing = "\n" if raw.endswith("\n") else ""
            io.open(path, "w", encoding="utf-8").write(
                json.dumps(d, ensure_ascii=False, indent=2) + trailing)
        errs = check(loc, source)
        if errs:
            fail += 1
            print(f"FAIL {loc}: {'; '.join(errs)}")
        else:
            print(f"OK   {loc}")
    n = len(REFUTED_BODIES) if source == "refuted" else len(BODIES)
    verb = "APPLIED" if apply else f"VERIFY[{source}]"
    print(f"{verb} — {n-fail}/{n} pass, {fail} fail")
    return fail


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    source = "tree"
    if "--control" in sys.argv:
        source = sys.argv[sys.argv.index("--control") + 1]
    sys.exit(1 if run(source, apply=apply) else 0)
