#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pinterest one-time OAuth helper — Vaulto social publisher
# (ARY-2276, parent ARY-655 / ARY-654).
#
# WHAT THIS IS
#   The founder runs this ONCE, on their own machine, signed into their own
#   Pinterest *business* account, to mint the 5 secrets the automated daily
#   publisher needs. You never hand-build the token request again.
#
# IT KILLS THE THREE STEP-3 (token-exchange) FOOTGUNS
#   1. redirect_uri mismatch  -> ONE $REDIRECT_URI is reused byte-for-byte in
#      BOTH the authorize URL and the token POST, and the exact string you must
#      register in the app is printed for you.
#   2. bad Basic-auth header  -> the token POST uses `curl -u APP_ID:APP_SECRET`,
#      so curl builds the Authorization header. Nothing is hand-rolled/base64'd.
#   3. single-use / expired code -> the script prints the authorize URL, WAITS
#      for you to paste a FRESH code, then POSTs it immediately.
#
# REQUIRES  bash + curl only (both preinstalled on macOS & Linux). No other deps.
# SAFETY    Nothing is committed; the only network call is to Pinterest's own API.
# ---------------------------------------------------------------------------
set -euo pipefail

API="https://api.pinterest.com/v5"
AUTHORIZE="https://www.pinterest.com/oauth/"
SCOPES="pins:write,boards:read"              # least-privilege (ARY-655 greenlight)
# One redirect_uri, reused everywhere. Override with e.g.
#   REDIRECT_URI="https://myvaulto.com/" ./pinterest-oauth.sh
REDIRECT_URI="${REDIRECT_URI:-http://localhost:8085/}"

# --- helpers ---------------------------------------------------------------
c_bold=$'\033[1m'; c_dim=$'\033[2m'; c_grn=$'\033[32m'; c_ylw=$'\033[33m'; c_rst=$'\033[0m'
say()  { printf '%s\n' "$*"; }
die()  { printf '\n%s❌ %s%s\n' "$c_ylw" "$*" "$c_rst" >&2; exit 1; }

rawurlencode() {  # RFC-3986 encode $1 (for putting the redirect_uri in a URL)
  local s="$1" o="" c i
  for (( i=0; i<${#s}; i++ )); do
    c="${s:$i:1}"
    case "$c" in
      [a-zA-Z0-9.~_-]) o+="$c" ;;
      *) printf -v c '%%%02X' "'$c"; o+="$c" ;;
    esac
  done
  printf '%s' "$o"
}

json_str() {  # json_str <field> <json>  -> value of a flat "field":"..." pair
  # `|| true` keeps a no-match (grep exit 1) from tripping `set -e`/pipefail,
  # so a failed exchange still reaches the diagnostic block below.
  local m
  m="$(printf '%s' "$2" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 || true)"
  printf '%s' "$m" | sed -E "s/.*:[[:space:]]*\"([^\"]*)\"/\1/"
}

command -v curl >/dev/null 2>&1 || die "curl is required but not installed."

# --- 0. inputs -------------------------------------------------------------
say "${c_bold}Pinterest OAuth helper — Vaulto social publisher${c_rst}"
say "${c_dim}Scopes requested: ${SCOPES} (least-privilege).${c_rst}"
say ""
APP_ID="${APP_ID:-}";        [[ -n "$APP_ID"     ]] || read -rp  "Pinterest APP_ID (app 'client id'): " APP_ID
APP_SECRET="${APP_SECRET:-}"
if [[ -z "$APP_SECRET" ]]; then read -rsp "Pinterest APP_SECRET (hidden): " APP_SECRET; echo; fi
BOARD_ID="${BOARD_ID:-}"     # optional here; if blank we list your boards after auth
[[ -n "$APP_ID"     ]] || die "APP_ID is required."
[[ -n "$APP_SECRET" ]] || die "APP_SECRET is required."

# --- 1. tell the founder the EXACT redirect_uri to register ----------------
say ""
say "${c_bold}STEP 1 — Register this redirect URI in your Pinterest app${c_rst}"
say "  Pinterest developer app → Configure → ${c_bold}Redirect URIs${c_rst} → add EXACTLY:"
say ""
say "      ${c_grn}${REDIRECT_URI}${c_rst}"
say ""
say "  ${c_dim}(It must match character-for-character. This same string is reused in"
say "   the token exchange below, so a mismatch is impossible from our side.)${c_rst}"
read -rp $'\nPress Enter once that redirect URI is saved in the app… '

# --- 2. build + print the authorize URL ------------------------------------
STATE="$( (head -c 16 /dev/urandom 2>/dev/null || echo "$RANDOM$RANDOM") | od -An -tx1 | tr -d ' \n' )"
ENC_REDIRECT="$(rawurlencode "$REDIRECT_URI")"
ENC_SCOPES="$(rawurlencode "$SCOPES")"
AUTH_URL="${AUTHORIZE}?client_id=${APP_ID}&redirect_uri=${ENC_REDIRECT}&response_type=code&scope=${ENC_SCOPES}&state=${STATE}"

say ""
say "${c_bold}STEP 2 — Authorize (grants ${SCOPES})${c_rst}"
say "  1. Open this URL in a browser where you're logged into the Pinterest"
say "     ${c_bold}business${c_rst} account for the brand:"
say ""
say "      ${c_grn}${AUTH_URL}${c_rst}"
say ""
say "  2. Click ${c_bold}Give access${c_rst}."
say "  3. Your browser will land on ${REDIRECT_URI} — if it's the localhost"
say "     default you'll see a ${c_bold}\"can't reach this page\"${c_rst} error. ${c_bold}That is expected.${c_rst}"
say "     The value we need is the ${c_bold}code${c_rst} in that page's address bar:"
say "       ${c_dim}${REDIRECT_URI}?code=${c_bold}<THIS PART>${c_rst}${c_dim}&state=…${c_rst}"

# --- 3. read a FRESH code, then POST immediately (single-use safe) ----------
say ""
CODE=""
while [[ -z "$CODE" ]]; do
  read -rp "Paste the code (or the whole redirected URL): " CODE
  # Forgive a full-URL paste: pull the code param out of it.
  if [[ "$CODE" == *code=* ]]; then CODE="${CODE#*code=}"; CODE="${CODE%%&*}"; fi
  CODE="$(printf '%s' "$CODE" | tr -d '[:space:]')"
done

say ""
say "${c_bold}STEP 3 — Exchanging code for tokens (POST /v5/oauth/token)…${c_rst}"
# curl -u builds the Basic auth header; --data-urlencode sends form-encoded body.
# redirect_uri is the SAME $REDIRECT_URI used in the authorize URL above.
RESP="$(curl -sS -u "${APP_ID}:${APP_SECRET}" \
             -X POST "${API}/oauth/token" \
             --data-urlencode "grant_type=authorization_code" \
             --data-urlencode "code=${CODE}" \
             --data-urlencode "redirect_uri=${REDIRECT_URI}" \
             -w $'\n%{http_code}')" || die "curl failed to reach Pinterest."
HTTP_CODE="${RESP##*$'\n'}"
BODY="${RESP%$'\n'*}"

ACCESS_TOKEN="$(json_str access_token "$BODY")"
REFRESH_TOKEN="$(json_str refresh_token "$BODY")"

if [[ "$HTTP_CODE" != "200" || -z "$ACCESS_TOKEN" ]]; then
  say ""
  say "${c_ylw}Token exchange FAILED (HTTP ${HTTP_CODE}).${c_rst}"
  say "Raw response:"
  say "  ${BODY}"
  say ""
  say "Most likely cause (in order):"
  say "  • redirect_uri not registered / not identical — it must be EXACTLY:"
  say "        ${REDIRECT_URI}"
  say "  • the code was already used or expired — re-run and paste a FRESH one"
  say "    (each code is single-use and short-lived)."
  say "  • wrong APP_ID / APP_SECRET (a 401 'authentication failed' points here)."
  die "See above and re-run."
fi

# --- 4. resolve / confirm the board id -------------------------------------
# The BOARD_ID is Pinterest's own long numeric id for a board (e.g.
# 881016721410161). It is NOT the board's name or URL slug. We fetch it for
# you from the API and print it in the left column below — you just copy it.
if [[ -z "$BOARD_ID" ]]; then
  while [[ -z "$BOARD_ID" ]]; do
    say ""
    say "${c_bold}Your boards (the BOARD_ID is the long number on the LEFT):${c_rst}"
    BOARDS="$(curl -sS -H "Authorization: Bearer ${ACCESS_TOKEN}" "${API}/boards?page_size=50" || true)"
    # Print each id/name pair best-effort (flat fields inside items[]).
    LISTED="$(printf '%s' "$BOARDS" \
      | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"|"name"[[:space:]]*:[[:space:]]*"[^"]*"' \
      | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/' \
      | paste - - 2>/dev/null | awk -F'\t' '{printf "  %-22s  %s\n", $1, $2}' || true)"
    if [[ -n "$LISTED" ]]; then
      say "$LISTED"
      say ""
      say "  ${c_dim}Copy the long number to the LEFT of the board you want to post to.${c_rst}"
    else
      # No boards on this account yet (or none visible to this token).
      say "  ${c_ylw}(no boards found on this Pinterest account yet)${c_rst}"
      say ""
      say "  You have no boards to publish to. In the same browser, go to"
      say "  ${c_bold}pinterest.com${c_rst} → click ${c_bold}+${c_rst} (top right) → ${c_bold}Create board${c_rst} →"
      say "  give it any name (e.g. \"Vaulto\") → ${c_bold}Create${c_rst}."
      say "  Then come back here and press Enter to re-check — its numeric id"
      say "  will appear above and you can paste it. ${c_dim}(No need to re-run OAuth.)${c_rst}"
      read -rp $'\nPress Enter to re-check for boards (or paste a BOARD_ID if you have one)… ' BOARD_ID
      BOARD_ID="$(printf '%s' "$BOARD_ID" | tr -d '[:space:]')"
      [[ -z "$BOARD_ID" ]] && continue   # empty = re-list the boards
      break                              # they pasted an id directly
    fi
    read -rp "Paste the BOARD_ID (the long number) you want to publish to: " BOARD_ID
    BOARD_ID="$(printf '%s' "$BOARD_ID" | tr -d '[:space:]')"
  done
fi
[[ -n "$BOARD_ID" ]] || die "BOARD_ID is required to finish."

# --- 5. print the paste-ready secrets --------------------------------------
say ""
say "${c_grn}${c_bold}✅ Success — OAuth complete.${c_rst}"
say ""
say "Paste these into ${c_bold}vaulto-marketing → Settings → Secrets and variables"
say "→ Actions${c_rst} (one repository secret per line, names EXACTLY as shown):"
say ""
say "${c_bold}────────────────────────────────────────────────────────────${c_rst}"
printf 'PINTEREST_ACCESS_TOKEN=%s\n'  "$ACCESS_TOKEN"
printf 'PINTEREST_REFRESH_TOKEN=%s\n' "$REFRESH_TOKEN"
printf 'PINTEREST_APP_ID=%s\n'        "$APP_ID"
printf 'PINTEREST_APP_SECRET=%s\n'    "$APP_SECRET"
printf 'PINTEREST_BOARD_ID=%s\n'      "$BOARD_ID"
say "${c_bold}────────────────────────────────────────────────────────────${c_rst}"
say ""
say "${c_dim}The access token is ~30 days; the daily publisher auto-refreshes it"
say "with the refresh token, so you won't need to run this again. Once all 5"
say "secrets are saved, the automated publisher goes live with no code change.${c_rst}"
