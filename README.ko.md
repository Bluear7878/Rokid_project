# Rokid Glasses 앱

[English](README.md) | **한국어** | [简体中文](README.zh-CN.md)

화면이 있는 Rokid Glasses(YodaOS-Sprite, Android 12)용 AIUI 앱입니다.

| 앱 | 폴더 | 하는 일 |
|---|---|---|
| Speak Korean 0.3.3 (통역) | `outputs/speak-english` | 한국어 음성을 영어·중국어(간체)·프랑스어로 번역, 프랑스어 한글 근사 발음 선택 |
| Speak French 0.1.2 (호환용) | `outputs/speak-french` | 기존 프랑스어 앱 유지, 한 번의 뒤로가기로 종료 요청하도록 수정 |

Speak Korean은 기존 Speak English Agent의 업데이트입니다. 소스 폴더와 기본 명령은 유지합니다. 입력은 한국어(`ko-KR`)로 고정하며, 한국어 메뉴를 버튼·밀기로 조작합니다. 언어 자동 감지와 음성 메뉴 제어는 없습니다. 모든 화면에서 뒤로 한 번으로 앱 종료를 요청합니다. 60초 동안 조작이 없으면 앱은 유지하고 글자만 지웁니다. 다른 언어를 고르려면 앱을 다시 엽니다.

실제 안경의 한국어 음성 인식·번역·속도와 뒤로가기 종료는 아직 검증하지 못했습니다. 로컬 검사는 모의 음성·번역 API를 씁니다.

"Hi Rokid, open Speak Korean" 또는 "스피크 코리안 열어 줘"로 실행을 요청합니다. 작동하는 French 앱의 구성에 맞춰 설명에는 기능을, 한국어 시작 안내에는 첫 사용 방법을, Agent 프롬프트에는 페이지 실행 지시를 적었습니다. 녹음 중 새 번역 세션을 준비하고, 번역문을 스트리밍으로 먼저 표시합니다. 프랑스어 한글 발음은 최종 검증 후 표시합니다. 스트리밍을 지원하지 않는 호스트는 완성된 응답을 한 번에 표시합니다. 실제 호출 분기와 속도 개선은 안경에서 확인해야 합니다.

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

1. AIUI Studio(https://aiui-global.rokid.com)의 해당 Agent에 소스를 반영하고 AIX Packaging 후 Save Details를 실행합니다. 기존 Speak English의 이름을 Speak Korean로 바꾸며 새 Agent를 만들 필요는 없습니다.
2. 휴대폰 Hi Rokid 앱에서 Settings > Developer Options > AIUI > Update glasses resource를 실행합니다.

Rokid 개발 케이블이 있으면 `rokid-dev.ps1 install-launch`로 Studio를 거치지 않고 ADB로 설치합니다. 이 경로는 아직 시험하지 못했습니다.

## 주의

각 앱 폴더의 `AGENTS.md`는 안경에서 도는 Agent의 동작 정의이며 AIX 패키지에 들어갑니다. 코딩 agent에게 주는 지시 파일이 아닙니다. 코딩 agent용 지시는 저장소 루트의 `AGENTS.md`입니다.

## 개인정보 보호 훅

공개 저장소이므로, 개인·기기·계정 정보가 들어간 커밋과 푸시를 git 훅이 막습니다. 이름과 메일 주소, 기기 일련번호, ID와 토큰, 로컬 사용자 경로, IP·MAC 주소, 이미지, 녹음, 로그가 대상입니다. 저장소를 받을 때마다 한 번 켭니다.

```
git config core.hooksPath .githooks
```

훅에는 본인 식별값을 적은 비공개 목록도 필요합니다. 이 목록은 `.git` 안에만 있고 푸시되지 않습니다. 목록, 규칙, 예외를 기록하는 방법은 `.githooks/privacy-scan.sh`에 적혀 있습니다.

## 라이선스

Apache License 2.0입니다. [LICENSE](LICENSE)를 참고하세요.
