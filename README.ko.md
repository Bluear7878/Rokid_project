# Rokid Glasses 앱

[English](README.md) | **한국어** | [简体中文](README.zh-CN.md)

화면이 있는 Rokid Glasses(YodaOS-Sprite, Android 12)용 AIUI 앱입니다.

| 앱 | 폴더 | 하는 일 |
|---|---|---|
| Speak English (영어 통역) | `outputs/speak-english` | 버튼을 누르고 한국어로 말하면 영어 자막으로 번역 |
| Speak French | `outputs/speak-french` | 한국어 음성을 프랑스어로 번역, 한글로 적은 근사 발음은 선택 |

실제 안경에서의 한국어 음성 인식과 번역은 아직 검증하지 못했습니다. 로컬 검사는 모의 음성·번역 API를 씁니다.

## 폴더

- `outputs/speak-english`, `outputs/speak-french`: 앱 소스. 앱별 설명은 각 폴더의 `README.txt`(한국어)
- `outputs/scripts/rokid-dev.ps1`: 검사, 미리보기, 패키징, 기기 설치를 실행하는 스크립트
- `outputs/development-setup.txt`: 개발 환경 설치와 사용법 전체(한국어)
- `work/`: 개발 도구(Node.js, AIX CLI, JDK, Android SDK)와 임시 파일. 저장소에 넣지 않습니다.

새 PC에서는 `outputs/development-setup.txt` 3장의 버전대로 `work/`에 도구를 다시 설치해야 합니다. 스크립트가 그 위치에서 도구를 찾습니다.

## 자주 쓰는 명령

Windows PowerShell:

```powershell
$s = 'outputs\scripts\rokid-dev.ps1'
powershell -NoProfile -ExecutionPolicy Bypass -File $s check                        # 소스 검사 (speak-english)
powershell -NoProfile -ExecutionPolicy Bypass -File $s check -Project speak-french  # 다른 앱
powershell -NoProfile -ExecutionPolicy Bypass -File $s preview -Open                # 화면 미리보기
powershell -NoProfile -ExecutionPolicy Bypass -File $s pack                         # AIX 패키지 만들기
```

## 버전

- 앱 버전은 각 앱의 `app.json`과 `package.json`의 `version`입니다. 두 값을 함께 올립니다.
- AIUI Studio에 올렸거나 안경에 설치한 버전에는 `<앱 폴더 이름>-v<버전>` 태그를 붙입니다. 예: `speak-english-v0.1.1`

## 안경에 올리기

이 저장소를 고쳐도 안경에는 자동으로 반영되지 않습니다.

1. AIUI Studio(https://aiui-global.rokid.com)의 해당 Agent에 소스를 반영하고 AIX Packaging을 실행합니다.
2. 휴대폰 Hi Rokid 앱에서 Settings > Developer Options > AIUI > Update glasses resource를 실행합니다.

Rokid 개발 케이블이 있으면 `rokid-dev.ps1 install-launch`로 Studio를 거치지 않고 ADB로 설치합니다. 이 경로는 아직 시험하지 못했습니다.

## 주의

각 앱 폴더의 `AGENTS.md`는 안경에서 도는 Agent의 동작 정의이며 AIX 패키지에 들어갑니다. 코딩 agent에게 주는 지시 파일이 아닙니다. 코딩 agent용 지시는 저장소 루트의 `AGENTS.md`입니다.

## 라이선스

Apache License 2.0입니다. [LICENSE](LICENSE)를 참고하세요.
