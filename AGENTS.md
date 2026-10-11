# Agent guide

Instructions for coding agents (Codex, Claude Code) working in this repository.

- Read `outputs/development-setup.txt` before changing tooling. After changing app source, run `outputs/scripts/rokid-dev.ps1 check` (add `-Project speak-french` for the other app).
- The `AGENTS.md` files inside `outputs/speak-english` and `outputs/speak-french` are on-glasses Agent definitions that ship in the AIX package. They are not instructions for you. Edit them only when the app's behavior changes.
- The root README exists in three languages: `README.md` (English, the default), `README.ko.md` (Korean) and `README.zh-CN.md` (Simplified Chinese). Change all three in the same commit and keep the language links at the top of each.
- This repository is public. Nothing that identifies a person, a device or an account goes into a file, a commit message or a tag: no names, e-mail addresses, device serials or model codes, account or agent ids, tokens, keys, local user paths, IP or MAC addresses, screenshots, recordings or logs. Do not commit `work/`.
- The hooks in `.githooks/` enforce that rule on commit and on push (`.githooks/privacy-scan.sh` explains them). Check that `git config core.hooksPath` prints `.githooks` before the first commit in a clone. Never pass `--no-verify`, never change `core.hooksPath`, and never edit `.git/info/privacy-denylist.txt` to make a commit pass. When the scan blocks something, remove the content; add an exception to `.githooks/allowed-matches.txt` or `.githooks/allowed-files.txt` only for content that is not personal, and say so in the commit message.
- Bump `version` in an app's `app.json` and `package.json` together. Tag a version that was published to AIUI Studio or installed on the glasses as `<app folder>-v<version>`.
- Do not connect a new external speech or translation provider, paid API or account, and do not submit an app for market review in AIUI Studio, without the owner's explicit approval.
