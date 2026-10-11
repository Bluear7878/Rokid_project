#!/usr/bin/env bash
# privacy-scan.sh - refuse content that identifies a person, a device or an account.
#
# This repository is public. The hooks next to this file call the scanner so that
# nothing of that kind is committed or pushed. It can also be run by hand:
#
#   .githooks/privacy-scan.sh --staged          what `git commit` is about to record
#   .githooks/privacy-scan.sh --commit <rev>    one commit: files, message, identity
#   .githooks/privacy-scan.sh --range <A..B>    every commit in a range
#   .githooks/privacy-scan.sh --tree <rev>      every file at a revision
#   .githooks/privacy-scan.sh --history         every commit reachable from any ref
#   .githooks/privacy-scan.sh --message <file>  a commit message file
#
# Enable the hooks once per clone:   git config core.hooksPath .githooks
#
# Two inputs are local to a clone and are never committed:
#   .git/info/privacy-denylist.txt   literal strings that must never appear (your name,
#                                    e-mail, device serials, device names, account ids).
#                                    Letter case is ignored. The scan refuses to run
#                                    without this file.
#   git config privacy.allowedEmail  regular expression the author and committer e-mail
#                                    must match (default: GitHub noreply addresses).
#
# Tracked exceptions, reviewed like code:
#   .githooks/allowed-matches.txt    regular expressions for matched text that is fine
#   .githooks/allowed-files.txt      exact paths that may be committed although their
#                                    file type is blocked (an app icon, for example)
#
# Needs bash 4 or newer (Git for Windows and current Linux both have it).
set -u
# Byte-wise matching. Case is folded before matching instead of with `grep -i`: GNU grep
# 3.0, which Git for Windows ships, aborts on `grep -i -F -f` in the C locale.
LC_ALL=C
export LC_ALL

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DENY_SRC="$(git rev-parse --git-path info/privacy-denylist.txt)"
MAX_BYTES=1048576
TAB="$(printf '\t')"

git() { command git -c core.quotePath=false "$@"; }

TMP="$(mktemp -d 2>/dev/null || mktemp -d -t privacy-scan)"
trap 'rm -rf "$TMP"' EXIT
findings=0

report() {
  findings=$((findings + 1))
  printf '  %s\n' "$1" >&2
}

# grep into a file. Status 0 and 1 are "matched" and "no match"; anything else means
# the check did not run, and that must never pass as clean.
run_grep() { # $1 output file, then grep arguments
  local out="$1"
  shift
  grep "$@" > "$out" 2> "$TMP/err"
  GREP_STATUS=$?
  [ "$GREP_STATUS" -le 1 ] || report "[scanner-error] grep ended with status $GREP_STATUS, so a check did not run"
}

load_lines() { # $1 file; prints its lines without comments, blank lines and CR
  [ -f "$1" ] && grep -v -E '^[[:space:]]*(#|$)' "$1" | tr -d '\r'
}

# --- local inputs -----------------------------------------------------------------

DENY="$TMP/deny"
# Entries shorter than 4 bytes would match almost everything.
load_lines "$DENY_SRC" | tr 'A-Z' 'a-z' | awk 'length($0) >= 4' > "$DENY"
if [ ! -s "$DENY" ]; then
  cat >&2 <<EOF
privacy-scan: BLOCKED - no private denylist.
  Create $DENY_SRC with one literal string per line: your name, e-mail address,
  device serial numbers, device names, account ids. Lines starting with # are comments.
  The file stays inside .git and is never committed or pushed.
EOF
  exit 2
fi
mapfile -t DENY_ENTRIES < "$DENY"
mapfile -t ALLOW_PATTERNS < <(load_lines "$HERE/allowed-matches.txt")
mapfile -t ALLOW_FILES < <(load_lines "$HERE/allowed-files.txt")

EMAIL_OK="$(git config --get privacy.allowedEmail || true)"
[ -n "$EMAIL_OK" ] || EMAIL_OK='@users\.noreply\.github\.com$'

# --- rules --------------------------------------------------------------------------
# name <TAB> flag <TAB> extended regular expression
# Flag i: the rule runs on lower-cased text, so its expression is written in lower case.

RULES="$TMP/rules"
cat > "$RULES" <<'EOF'
private-key	-	-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----
token	-	(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|hf_[A-Za-z0-9]{20,})
jwt	-	eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}
credential	i	(password|passwd|secret|token|api[_-]?key|access[_-]?key)["']?[[:space:]]*[:=][[:space:]]*["'][^"'[:space:]]{8,}["']
credential	i	(secret|token|password|passwd|api_?key)[a-z_.]*[[:space:]]*=[[:space:]]*[a-z0-9+/_=-]{16,}([[:space:]"'&;,]|$)
hex-id	-	\b[0-9A-Fa-f]{32,}\b
mac-address	-	\b([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b
device-serial	i	(serial[ _-]?(number|num|no)?|adb -s|android_serial|imei|imsi|iccid|meid|일련번호|시리얼( ?번호)?)[^a-z0-9]{0,12}[a-z0-9]*[0-9][a-z0-9]{5,}
adb-device-line	-	^[[:space:]]*[A-Za-z0-9._:-]*[0-9][A-Za-z0-9._:-]{5,}[[:space:]]+(device|unauthorized|offline)([[:space:]]|$)
email	-	[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}
home-path	-	([A-Za-z]:[\\/]+Users[\\/]+[^\\/[:space:]"'<>|:*?$%{]+|/(home|Users|c/Users)/[A-Za-z0-9._-]+)
ip-address	-	\b([0-9]{1,3}\.){3}[0-9]{1,3}\b
phone-number	-	\b01[016789][- .]?[0-9]{3,4}[- .]?[0-9]{4}\b
wifi	i	(ssid|psk|wi-?fi[ _-]?(password|passwd|pwd|key))[[:space:]]*[:=][[:space:]]*[^[:space:]]{3,}
EOF
# All expressions of one kind in one file: a single grep per kind tells whether a text
# needs the rule-by-rule pass at all.
awk -F "$TAB" '$2 != "i" { print $3 }' "$RULES" > "$TMP/rules.exact"
awk -F "$TAB" '$2 == "i" { print $3 }' "$RULES" > "$TMP/rules.lower"

# Matched against the lower-cased path.
BLOCKED_EXT='\.(png|jpe?g|gif|webp|bmp|heic|tiff?|ico|mp4|mov|avi|mkv|wav|pcm|mp3|m4a|aac|ogg|opus|apk|aab|aix|zip|7z|rar|tar|gz|tgz|jar|aar|so|dex|jks|keystore|pem|p12|pfx|key|lc|log|sqlite|db|pcap)$'
BLOCKED_NAME='(^|/)(\.env(\.[^/]*)?|local\.properties|google-services\.json|\.credentials\.json|auth\.json|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|\.netrc|\.npmrc|settings\.local\.json|history\.jsonl)$'
BLOCKED_DIR='^(work|memory|\.claude/projects)/'

# --- checks -------------------------------------------------------------------------

allowed_match() { # $1 matched text
  local pattern
  for pattern in ${ALLOW_PATTERNS[@]+"${ALLOW_PATTERNS[@]}"}; do
    [[ $1 =~ $pattern ]] && return 0
  done
  return 1
}

allowed_file() { # $1 path
  local entry
  for entry in ${ALLOW_FILES[@]+"${ALLOW_FILES[@]}"}; do
    [ "$entry" = "$1" ] && return 0
  done
  return 1
}

in_denylist() { # $1 short text such as a path or a name
  local text="${1,,}" entry
  for entry in "${DENY_ENTRIES[@]}"; do
    [[ $text == *"$entry"* ]] && return 0
  done
  return 1
}

check_text() { # $1 label, $2 file holding the text
  local label="$1" file="$2" name flag re hit text exact lowered
  tr 'A-Z' 'a-z' < "$file" > "$TMP/lower"
  run_grep "$TMP/quick" -c -E -f "$TMP/rules.exact" "$file"
  exact=$GREP_STATUS
  run_grep "$TMP/quick" -c -E -f "$TMP/rules.lower" "$TMP/lower"
  lowered=$GREP_STATUS
  if [ "$exact" -eq 0 ] || [ "$lowered" -eq 0 ]; then
    while IFS="$TAB" read -r name flag re; do
      if [ "$flag" = i ]; then
        [ "$lowered" -eq 0 ] || continue
        run_grep "$TMP/hits" -n -o -E -e "$re" "$TMP/lower"
      else
        [ "$exact" -eq 0 ] || continue
        run_grep "$TMP/hits" -n -o -E -e "$re" "$file"
      fi
      while IFS= read -r hit; do
        text="${hit#*:}"
        allowed_match "$text" || report "$label:${hit%%:*}: [$name] ${text:0:70}"
      done < "$TMP/hits"
    done < "$RULES"
  fi
  run_grep "$TMP/hits" -n -F -f "$DENY" "$TMP/lower"
  while IFS= read -r hit; do
    report "$label:${hit%%:*}: [private-denylist] an entry of your private denylist"
  done < "$TMP/hits"
}

check_path() { # $1 label, $2 path
  local label="$1" path="$2" low="${2,,}"
  in_denylist "$path" &&
    report "$label: [private-denylist] the file path contains an entry of your private denylist"
  allowed_file "$path" && return 0
  if [[ $low =~ $BLOCKED_EXT ]]; then
    report "$label: [file-type] this kind of file is not committed here (image, recording, archive, package, key or log)"
  elif [[ $low =~ $BLOCKED_NAME ]]; then
    report "$label: [file-name] credential or machine-local file"
  elif [[ $path =~ $BLOCKED_DIR ]]; then
    report "$label: [directory] this directory stays out of the repository"
  fi
}

check_content() { # $1 label, $2 path, $3 file holding the content
  local label="$1" path="$2" file="$3" size
  if ! tr -d '\000' < "$file" | cmp -s - "$file"; then
    allowed_file "$path" || report "$label: [unscannable] binary or UTF-16 content cannot be checked"
    return 0
  fi
  size=$(wc -c < "$file")
  if [ "$size" -gt "$MAX_BYTES" ]; then
    allowed_file "$path" || report "$label: [file-size] larger than $MAX_BYTES bytes"
  fi
  check_text "$label" "$file"
}

check_identity() { # $1 label, $2 author name, $3 author e-mail, $4 committer name, $5 committer e-mail
  local label="$1" mail
  for mail in "$3" "$5"; do
    [[ $mail =~ $EMAIL_OK ]] ||
      report "$label: [identity] e-mail <$mail> does not match privacy.allowedEmail ($EMAIL_OK)"
  done
  in_denylist "$2 / $4" &&
    report "$label: [identity] author or committer name is an entry of your private denylist"
}

scan_paths() { # $1 label prefix, $2 revision prefix for git show, $3 file listing paths
  local path
  while IFS= read -r path; do
    check_path "$1$path" "$path"
    git show "$2$path" > "$TMP/content" 2>/dev/null || continue
    check_content "$1$path" "$path" "$TMP/content"
  done < "$3"
}

scan_commit() { # $1 revision
  local rev="$1" short an ae cn ce
  short="$(git rev-parse --short "$rev")"
  IFS="$TAB" read -r an ae cn ce < <(git log -1 --format="%an$TAB%ae$TAB%cn$TAB%ce" "$rev")
  check_identity "$short" "$an" "$ae" "$cn" "$ce"
  git log -1 --format=%B "$rev" > "$TMP/message"
  check_text "$short message" "$TMP/message"
  git diff-tree --root -m -r --no-commit-id --name-only --diff-filter=ACMR "$rev" | sort -u > "$TMP/paths"
  scan_paths "$short " "$rev:" "$TMP/paths"
}

scan_staged() {
  local ident an ae cn ce
  ident="$(git var GIT_AUTHOR_IDENT 2>/dev/null)"
  an="${ident%% <*}"
  ae="${ident#*<}"
  ae="${ae%%>*}"
  ident="$(git var GIT_COMMITTER_IDENT 2>/dev/null)"
  cn="${ident%% <*}"
  ce="${ident#*<}"
  ce="${ce%%>*}"
  check_identity "commit identity" "$an" "$ae" "$cn" "$ce"
  git diff --cached --name-only --diff-filter=ACMR > "$TMP/paths"
  scan_paths "" ":" "$TMP/paths"
}

# --- modes --------------------------------------------------------------------------

case "${1:-}" in
  --staged) scan_staged ;;
  --commit) scan_commit "$2" ;;
  --range) for rev in $(git rev-list "$2"); do scan_commit "$rev"; done ;;
  --history) for rev in $(git rev-list --all); do scan_commit "$rev"; done ;;
  --tree)
    git ls-tree -r --name-only "${2:-HEAD}" > "$TMP/paths"
    scan_paths "" "${2:-HEAD}:" "$TMP/paths"
    ;;
  --message)
    tr -d '\r' < "$2" | grep -v '^#' > "$TMP/message"
    check_text "commit message" "$TMP/message"
    ;;
  *)
    sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//' >&2
    exit 2
    ;;
esac

if [ "$findings" -gt 0 ]; then
  cat >&2 <<EOF
privacy-scan: BLOCKED - $findings finding(s) above.
  Remove the content, or, when a match is harmless and not personal, add an exception
  to .githooks/allowed-matches.txt or .githooks/allowed-files.txt in the same change.
EOF
  exit 1
fi
exit 0
