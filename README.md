# Rokid Glasses Apps

**English** | [한국어](README.ko.md) | [简体中文](README.zh-CN.md)

AIUI apps for display-equipped Rokid Glasses (YodaOS-Sprite, Android 12).

| App | Folder | What it does |
|---|---|---|
| Speak Translate 0.2.0 | `outputs/speak-english` | Korean speech to English, Simplified Chinese or French; optional Hangul reading for French |
| Speak French 0.1.2 (legacy) | `outputs/speak-french` | Standalone French app retained with the same Back-to-close fix |

Speak Translate updates the existing Speak English Agent. The source folder and default commands remain unchanged. Input is fixed to Korean (`ko-KR`); all menus are Korean and use buttons/swipes without language detection or voice commands. One Back requests app closure from every screen. After 60 seconds of inactivity, the display clears while the app remains open. Reopen the app to choose another target.

Korean speech recognition, translation, latency and actual Back-to-close behavior have not been verified on real glasses yet. The local checks use mocked speech and translation APIs.

## Layout

- `outputs/speak-english`, `outputs/speak-french`: app source. Each folder has its own `README.txt` (in Korean).
- `outputs/scripts/rokid-dev.ps1`: runs checks, preview, packaging and device install
- `outputs/development-setup.txt`: the full setup and usage guide (in Korean)
- `work/`: development tools (Node.js, AIX CLI, JDK, Android SDK) and temporary files. Not in the repository.

On a new PC, reinstall the tools into `work/` using the versions listed in section 3 of `outputs/development-setup.txt`. The script expects to find them there.

## Common commands

Windows PowerShell:

```powershell
$s = 'outputs\scripts\rokid-dev.ps1'
powershell -NoProfile -ExecutionPolicy Bypass -File $s check                        # check the source (speak-english)
powershell -NoProfile -ExecutionPolicy Bypass -File $s check -Project speak-french  # the other app
powershell -NoProfile -ExecutionPolicy Bypass -File $s preview -Open                # screen preview
powershell -NoProfile -ExecutionPolicy Bypass -File $s pack                         # build the AIX package
```

## Versions

- An app's version is the `version` field in its `app.json` and `package.json`. Bump both together.
- A version that was published to AIUI Studio or installed on the glasses gets a tag named `<app folder>-v<version>`, for example `speak-english-v0.1.1`.

## Putting an app on the glasses

Changes in this repository do not reach the glasses automatically.

1. Update the matching Agent in AIUI Studio (https://aiui-global.rokid.com) with the source, then run AIX Packaging and Save Details. Rename the existing Speak English Agent to Speak Translate; no new Agent is needed.
2. In the Hi Rokid phone app, run Settings > Developer Options > AIUI > Update glasses resource.

With a Rokid development cable, `rokid-dev.ps1 install-launch` installs over ADB without going through Studio. This path has not been tested yet.

## Note

The `AGENTS.md` inside each app folder defines how the Agent behaves on the glasses, and it ships inside the AIX package. It is not an instruction file for coding agents. The `AGENTS.md` at the repository root is the one for coding agents.

## Privacy guard

This repository is public, so its git hooks refuse commits and pushes that contain personal, device or account information: names and e-mail addresses, device serials, ids and tokens, local user paths, IP and MAC addresses, images, recordings and logs. Enable them once in every clone:

```
git config core.hooksPath .githooks
```

The hooks also need a private list of your own identifiers, which stays inside `.git` and is never pushed. `.githooks/privacy-scan.sh` describes that list, the rules and how to record an exception.

## License

Apache License 2.0. See [LICENSE](LICENSE).
