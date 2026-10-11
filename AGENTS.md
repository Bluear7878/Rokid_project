# Agent guide

Instructions for coding agents (Codex, Claude Code) working in this repository.

- Read `outputs/development-setup.txt` before changing tooling. After changing app source, run `outputs/scripts/rokid-dev.ps1 check` (add `-Project speak-french` for the other app).
- The `AGENTS.md` files inside `outputs/speak-english` and `outputs/speak-french` are on-glasses Agent definitions that ship in the AIX package. They are not instructions for you. Edit them only when the app's behavior changes.
- The root README exists in three languages: `README.md` (English, the default), `README.ko.md` (Korean) and `README.zh-CN.md` (Simplified Chinese). Change all three in the same commit and keep the language links at the top of each.
- This repository is public. Do not commit `work/`, screenshots of account screens, device serials, tokens or keys.
- Bump `version` in an app's `app.json` and `package.json` together. Tag a version that was published to AIUI Studio or installed on the glasses as `<app folder>-v<version>`.
- Do not connect a new external speech or translation provider, paid API or account, and do not submit an app for market review in AIUI Studio, without the owner's explicit approval.
