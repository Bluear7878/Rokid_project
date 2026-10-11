통역 / Speak Translate — 버전 0.2.0

기존 Speak English를 통합 번역 앱으로 업데이트했습니다.
폴더 outputs/speak-english, VS Code 작업공간과 기본 개발 명령은 그대로 사용합니다.
기존 Speak French는 호환용으로 남아 있지만 새 통합 앱에서 프랑스어도 선택할 수 있습니다.

사용 방법
1. 앱을 열면 한국어 메뉴에서 영어 / 중국어(간체) / 프랑스어 중 번역할 언어를 고릅니다.
2. 프랑스어는 한글 근사 발음을 함께 볼지 선택합니다. 번역만 선택하면 발음 생성도 요청하지 않습니다.
3. 버튼을 누르고 한국어로 말합니다. 다시 누르거나 문장이 확정되면 번역합니다.
입력은 ko-KR 고정입니다. 언어 자동 감지나 음성으로 메뉴를 제어하는 단계가 없습니다.

조작
- 위/아래 밀기: 메뉴 선택 변경 또는 긴 결과 스크롤
- 확인/탭: 메뉴 확정, 음성 입력 시작·마치기, 번역 대기 중에는 취소
- 뒤로: 어느 화면에서든 작업·마이크·타이머 정리 후 즉시 앱 종료 요청
- 다른 언어를 고르려면 앱을 닫고 다시 엽니다.
- 대기·결과·오류·메뉴에서 60초 동안 조작하지 않으면 빈 화면으로 대기하며 앱은 유지합니다.
- 녹음·번역 중에는 화면을 지우지 않으며, 결과가 나온 시점부터 새로 1분을 셉니다.
- 빈 화면에서 탭은 다음 번역을 시작합니다. 아직 언어를 고르지 않았다면 메뉴부터 복원합니다.
- 음성 인식 20초, 인식 마무리 7초, 번역 25초 제한

개발 및 안경 반영
- outputs/development-setup.txt의 설치·사용 안내를 참고하세요.
- powershell -NoProfile -ExecutionPolicy Bypass -File outputs/scripts/rokid-dev.ps1 check
- 같은 명령의 check를 preview 또는 pack으로 바꾸어 미리보기/패키징합니다.
- AIUI Studio 기존 Speak English Agent에 소스와 이름 Speak Translate를 반영하고 AIX Packaging 후 Save Details합니다.
- 휴대폰 Hi Rokid > Settings > Developer Options > AIUI > Update glasses resource 실행 후 다운로드 완료를 확인합니다.
- 안경에서 Speak Translate를 엽니다. 개인 테스트에는 Submit for Review나 개발 케이블이 필요하지 않습니다.

검증 범위
- 제어 로직 19개 + 타이머 5개 모의 검사, 구문·JSON·AIX 패키징 사전 검사를 통과했습니다.
- 실제 안경의 뒤로가기, 한국어 인식, 번역 품질과 속도는 아직 검증하지 못했습니다.
- 로컬 미리보기에는 음성 호스트 기능이 연결되어 있지 않아 실제 음성 인식은 실패할 수 있습니다.
- 속도 개선 수치는 측정하지 않았습니다. 발음을 끄면 생성할 내용이 줄어들지만 서비스 응답 시간은 별도입니다.

음성 재생, 화자 식별, 상시 녹음, 원음·번역 기록 저장은 하지 않습니다.
기존 Rokid/Hi Rokid SpeechRecognition과 LanguageModel만 사용합니다. 외부 공급자나 API 키를 추가하지 않았습니다.

공식 문서
https://js.rokid.com/AIUI/api/ai-speech-recognition?lang=en-US&version=latest
https://js.rokid.com/AIUI/api/window?lang=en-US&version=latest
