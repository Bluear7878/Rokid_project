<#
.SYNOPSIS
  Rokid Glasses 개발용 통합 스크립트 (AIUI 앱 검사·미리보기·패키징, ADB 기기 작업, Android 샘플 빌드).

.DESCRIPTION
  작업 루트의 work 폴더에 설치된 도구만 사용합니다.
  JAVA_HOME / ANDROID_HOME / GRADLE_USER_HOME / PATH 는 이 스크립트 프로세스 안에서만 설정하며
  Windows 전역 환경 변수는 바꾸지 않습니다.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File rokid-dev.ps1 check
  powershell -NoProfile -ExecutionPolicy Bypass -File rokid-dev.ps1 install-launch -Serial <serial>
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('help', 'versions', 'check', 'test', 'preview', 'pack', 'devices', 'device-info',
    'install', 'launch', 'install-launch', 'logs', 'android-build', 'android-install', 'android-launch')]
  [string]$Action = 'help',

  # outputs 아래의 AIUI 앱 폴더 이름
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*$')]
  [string]$Project = 'speak-english',
  # 대상 기기 serial. 생략하면 ANDROID_SERIAL 환경 변수, work\device-serial.txt, 단일 연결 기기 순으로 찾습니다.
  [string]$Serial,
  # launch / install-launch 에서 열 페이지 경로
  [string]$Page = 'pages/index/index',
  # logs 에서 사용할 정규식(대소문자 구분). 생략하면 기본 필터를 씁니다.
  [string]$Pattern,
  # logs: 필터 없이 전체 logcat 출력
  [switch]$All,
  # logs: 화면에 보인 줄을 work\logs 에도 저장
  [switch]$Save,
  # preview: 브라우저로 주소 열기
  [switch]$Open,
  # install 계열: 기기 식별 검사(Rokid / Android 12) 를 건너뜀
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

# ---------------------------------------------------------------- 경로
$ScriptDir = $PSScriptRoot
$Outputs = Split-Path -Parent $ScriptDir
$Root = Split-Path -Parent $Outputs
$Work = Join-Path $Root 'work'

$App = Join-Path $Outputs $Project
$AixOut = Join-Path $Outputs "$Project.aix"
$NodeDir = Join-Path $Work 'local-tools\node-v24.21.0-win-x64'
$Node = Join-Path $NodeDir 'node.exe'
$Cli = Join-Path $Work 'aix-tools\node_modules\@yodaos-pkg\aix-cli\dist\cli.js'
$CliPackageJson = Join-Path $Work 'aix-tools\node_modules\@yodaos-pkg\aix-cli\package.json'

$Jdk = Join-Path $Work 'android\jdk-21.0.12.1_1'
$Sdk = Join-Path $Work 'android\sdk'
$GradleHome = Join-Path $Work 'android\gradle'
$Sample = Join-Path $Work 'android-samples\GlassesBareDevSample'
$SampleApk = Join-Path $Sample 'app\build\outputs\apk\debug\app-debug.apk'
$SampleActivity = 'com.rokid.glassesbaredevsample/.activities.main.MainActivity'

$SerialFile = Join-Path $Work 'device-serial.txt'
# Rokid 공식 Bare-Metal 문서 기준: YodaOS-Sprite = Android 12 (API 31)
$ExpectedApi = '31'
$DefaultLogPattern = 'Speak English|AIUI|aiui|yodaos|rokid\.agent|chromium|SpeechRecognition|LanguageModel|AndroidRuntime|FATAL EXCEPTION'

# ---------------------------------------------------------------- 출력 도우미
function Write-Step([string]$Text) { Write-Host ''; Write-Host "== $Text ==" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "[통과] $Text" -ForegroundColor Green }
function Write-Note([string]$Text) { Write-Host "[주의] $Text" -ForegroundColor Yellow }
function Fail([string]$Text) { Write-Host "[실패] $Text" -ForegroundColor Red; exit 1 }

function Assert-Path([string]$Path, [string]$What) {
  if (-not (Test-Path -LiteralPath $Path)) { Fail "$What 을(를) 찾을 수 없습니다: $Path" }
}

# 네이티브 출력은 가로채지 않고 그대로 콘솔에 흘려보냅니다. 호출 뒤 $LASTEXITCODE 를 확인하세요.
function Invoke-Aix {
  Assert-Path $Node 'Node.js'
  Assert-Path $Cli '공식 AIX CLI'
  & $Node $Cli @args
}

# ---------------------------------------------------------------- ADB
function Get-AdbPath {
  $cmd = Get-Command adb.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe'),
    (Join-Path $Sdk 'platform-tools\adb.exe')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

# adb 경로를 돌려주고, AIX CLI 가 이름만으로 adb 를 실행할 수 있도록 이 프로세스의 PATH 에 넣습니다.
function Use-Adb {
  $adb = Get-AdbPath
  if (-not $adb) { Fail 'adb 를 찾을 수 없습니다. Android SDK Platform-Tools 설치 상태를 확인하세요.' }
  $dir = Split-Path -Parent $adb
  if (($env:Path -split ';') -notcontains $dir) { $env:Path = "$dir;$env:Path" }
  return $adb
}

function Get-Devices([string]$Adb) {
  $list = @()
  foreach ($line in (& $Adb devices -l)) {
    if ($line -match '^\s*$' -or $line -match '^List of devices' -or $line -match '^\*') { continue }
    $parts = @($line.Trim() -split '\s+')
    if ($parts.Count -lt 2) { continue }
    $detail = ''
    if ($parts.Count -gt 2) { $detail = ($parts[2..($parts.Count - 1)] -join ' ') }
    $list += [pscustomobject]@{ Serial = $parts[0]; State = $parts[1]; Detail = $detail }
  }
  return , $list
}

function Show-Devices($Devices) {
  if (@($Devices).Count -eq 0) {
    Write-Host '연결된 ADB 기기가 없습니다.' -ForegroundColor Yellow
    return
  }
  foreach ($device in $Devices) {
    Write-Host ("  {0,-24} {1,-14} {2}" -f $device.Serial, $device.State, $device.Detail)
  }
}

function Show-DeviceGuidance($Devices) {
  $all = @($Devices)
  if ($all.Count -eq 0) {
    $usb = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
        Where-Object { $_.FriendlyName -match 'Rokid|ADB|Android' -or $_.Class -eq 'AndroidUsbDeviceClass' })
    if ($usb.Count -eq 0) {
      Write-Note 'Windows 가 안경을 USB 장치로 인식하지 못하고 있습니다(장치 관리자에 Rokid/ADB 항목 없음).'
      Write-Host '  가능한 원인:'
      Write-Host '   1) 동봉된 충전 케이블은 데이터 선이 없을 수 있습니다. Rokid 공식 문서는 전용 개발 케이블을 요구합니다.'
      Write-Host '   2) 케이블이 PC USB 포트에 직접 꽂혀 있지 않거나 안경 전원이 꺼져 있습니다.'
      Write-Host '   3) 휴대폰 Rokid AI(Hi Rokid) 앱에서 안경 ADB 를 아직 켜지 않았습니다.'
    }
    else {
      Write-Note 'USB 장치는 보이지만 ADB 로는 잡히지 않습니다.'
      foreach ($item in $usb) { Write-Host ("   - {0} [{1}] {2}" -f $item.FriendlyName, $item.Status, $item.InstanceId) }
      Write-Host '  휴대폰 Rokid AI(Hi Rokid) 앱에서 안경 ADB 를 켰는지, 장치 관리자에 드라이버 오류(노란 느낌표)가 없는지 확인하세요.'
    }
    return
  }
  foreach ($device in $all) {
    switch -Regex ($device.State) {
      '^device$' { Write-Ok "$($device.Serial): 연결·승인됨" }
      '^unauthorized$' {
        Write-Note "$($device.Serial): 승인되지 않음(unauthorized)"
        Write-Host '   이 PC 의 디버깅 키를 기기 쪽에서 허용해야 합니다.'
        Write-Host '   - 휴대폰 Rokid AI(Hi Rokid) 앱에서 안경 ADB 를 켠 상태인지 확인'
        Write-Host '   - 안경 화면이나 휴대폰 앱에 "USB 디버깅을 허용하시겠습니까?" 요청이 뜨면 허용'
        Write-Host '   - 요청이 보이지 않으면 케이블을 뽑았다 다시 꽂고 이 작업을 다시 실행'
      }
      '^offline$' { Write-Note "$($device.Serial): offline. 케이블을 다시 꽂고 안경을 깨운 뒤 다시 확인하세요." }
      '^authorizing$' { Write-Note "$($device.Serial): 승인 진행 중. 기기에서 디버깅 허용을 완료하세요." }
      default { Write-Note "$($device.Serial): 상태 '$($device.State)'. 일반 디버깅 상태가 아닙니다." }
    }
  }
  $online = @($all | Where-Object { $_.State -eq 'device' })
  if ($online.Count -gt 1) {
    Write-Note '승인된 기기가 여러 대입니다. 대상 serial 을 지정하세요.'
    Write-Host "   -Serial <serial> 로 실행하거나, $SerialFile 첫 줄에 serial 을 적어 두세요."
  }
}

function Resolve-Serial([string]$Adb) {
  $devices = Get-Devices $Adb
  $online = @($devices | Where-Object { $_.State -eq 'device' })
  $wanted = $Serial
  if (-not $wanted -and $env:ANDROID_SERIAL) { $wanted = $env:ANDROID_SERIAL }
  if (-not $wanted -and (Test-Path -LiteralPath $SerialFile)) {
    $first = Get-Content -LiteralPath $SerialFile -TotalCount 1
    if ($first) { $wanted = "$first".Trim() }
  }
  if ($wanted) {
    if (-not ($online | Where-Object { $_.Serial -eq $wanted })) {
      Show-Devices $devices
      Show-DeviceGuidance $devices
      Fail "지정한 기기($wanted)가 연결·승인된 상태가 아닙니다."
    }
    return $wanted
  }
  if ($online.Count -eq 0) {
    Show-Devices $devices
    Show-DeviceGuidance $devices
    Fail '사용할 수 있는 ADB 기기가 없습니다.'
  }
  if ($online.Count -gt 1) {
    Show-Devices $devices
    Show-DeviceGuidance $devices
    Fail '기기가 여러 대라 대상을 자동으로 고르지 않았습니다.'
  }
  return $online[0].Serial
}

# 설치 전에 대상이 무엇인지 보여 주고, 안경으로 볼 근거가 전혀 없으면 멈춥니다.
function Confirm-Glasses([string]$Adb, [string]$Target) {
  $props = @{}
  foreach ($key in 'ro.product.manufacturer', 'ro.product.brand', 'ro.product.model',
    'ro.build.version.release', 'ro.build.version.sdk', 'ro.build.display.id') {
    $props[$key] = ("" + (& $Adb -s $Target shell getprop $key)).Trim()
  }
  Write-Host ("대상 기기: {0} / {1} {2} {3} / Android {4} (API {5}) / 빌드 {6}" -f $Target,
    $props['ro.product.manufacturer'], $props['ro.product.brand'], $props['ro.product.model'],
    $props['ro.build.version.release'], $props['ro.build.version.sdk'], $props['ro.build.display.id'])
  $namedRokid = ("{0} {1} {2}" -f $props['ro.product.manufacturer'], $props['ro.product.brand'], $props['ro.product.model']) -match 'rokid'
  $expectedApi = ($props['ro.build.version.sdk'] -eq $ExpectedApi)
  if ($namedRokid -or $expectedApi) { return }
  if ($Force) {
    Write-Note '이 기기는 Rokid Glasses(Android 12 / API 31)로 보이지 않지만 -Force 로 계속합니다.'
    return
  }
  Fail "이 기기는 Rokid Glasses(YodaOS-Sprite, Android 12 / API $ExpectedApi)로 보이지 않아 설치를 멈췄습니다. 대상이 맞다면 -Force 를 붙여 다시 실행하세요."
}

# ---------------------------------------------------------------- AIUI: 검사
function Get-SourceFiles([string[]]$Extensions) {
  Get-ChildItem -LiteralPath $App -Recurse -File |
    Where-Object { $Extensions -contains $_.Extension -and $_.FullName -notmatch '\\(node_modules|\.aix)\\' }
}

function Invoke-Tests {
  Write-Step '제어 로직 검사 (모의 음성·번역 API)'
  Assert-Path $Node 'Node.js'
  $testDir = Join-Path $App 'tests'
  $tests = @()
  if (Test-Path -LiteralPath $testDir) { $tests = @(Get-ChildItem -LiteralPath $testDir -Filter '*.test.mjs' -File | Sort-Object Name) }
  if ($tests.Count -eq 0) { Fail "검사 파일이 없습니다: $testDir\*.test.mjs" }
  Push-Location -LiteralPath $App
  try {
    foreach ($test in $tests) {
      Write-Host "-- tests/$($test.Name)"
      & $Node "tests/$($test.Name)"
      if ($LASTEXITCODE -ne 0) { Fail "제어 로직 검사가 실패했습니다: tests/$($test.Name)" }
    }
  }
  finally { Pop-Location }
  Write-Ok "제어 로직 검사 ($($tests.Count)개 파일)"
  Write-Note '이 검사는 모의 API 를 사용합니다. 실제 음성 인식·번역을 검증한 것이 아닙니다.'
}

function Invoke-Check {
  Assert-Path $Node 'Node.js'
  Assert-Path $App '앱 소스 폴더'

  Write-Step 'JavaScript 구문 검사'
  $scripts = @(Get-SourceFiles @('.js', '.mjs'))
  foreach ($file in $scripts) {
    & $Node --check $file.FullName
    if ($LASTEXITCODE -ne 0) { Fail "구문 오류: $($file.FullName)" }
    Write-Host "  ok  $($file.FullName.Substring($App.Length + 1))"
  }
  Write-Ok "JavaScript $($scripts.Count)개 파일"

  Write-Step 'JSON 및 페이지 구성 검사'
  $jsonFiles = @(Get-SourceFiles @('.json'))
  $jsonCheck = 'for (const f of process.argv.slice(1)) { try { JSON.parse(require(''fs'').readFileSync(f, ''utf8'')); } catch (e) { console.error(''  JSON error: '' + f + '': '' + e.message); process.exitCode = 1; } }'
  & $Node --input-type=commonjs -e $jsonCheck @($jsonFiles | ForEach-Object { $_.FullName })
  if ($LASTEXITCODE -ne 0) { Fail 'JSON 파일에 오류가 있습니다.' }
  $appJson = Get-Content -LiteralPath (Join-Path $App 'app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($page in @($appJson.pages)) {
    foreach ($ext in '.js', '.wxml') {
      $pageFile = Join-Path $App (($page -replace '/', '\') + $ext)
      if (-not (Test-Path -LiteralPath $pageFile)) { Fail "app.json 의 페이지 '$page' 에 필요한 파일이 없습니다: $pageFile" }
    }
    Write-Host "  ok  $page"
  }
  Write-Ok "JSON $($jsonFiles.Count)개 파일, 페이지 $(@($appJson.pages).Count)개 (engine $($appJson.engine), 권한 $(@($appJson.permissions) -join ','))"

  Invoke-Tests

  Write-Step 'AIX 패키징 사전 검사 (임시 파일)'
  $tmpDir = Join-Path $Work 'tmp\check'
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
  $tmpAix = Join-Path $tmpDir "$Project-check.aix"
  Invoke-Aix pack $App -o $tmpAix
  if ($LASTEXITCODE -ne 0) { Fail 'AIX 패키징 사전 검사가 실패했습니다.' }
  Invoke-Aix list $tmpAix
  if ($LASTEXITCODE -ne 0) { Fail 'AIX 패키지 내용을 읽지 못했습니다.' }
  Write-Ok '패키징 가능'

  Write-Host ''
  Write-Host '소스 검사 완료: 구문 / JSON·페이지 구성 / 모의 API 제어 로직 / 패키징 가능 여부' -ForegroundColor Green
  Write-Note '실제 한국어 음성 인식과 영어 번역은 이 검사에 포함되지 않습니다. 음성 서비스가 연결된 환경(안경 등)에서 확인해야 합니다.'
}

# ---------------------------------------------------------------- AIUI: 미리보기 / 패키징
function Get-PreviewProcess {
  # 같은 앱 폴더를 미리보기 중인 서버만 찾습니다(다른 앱의 미리보기는 대상이 아님).
  $projectPattern = '[\\/]' + [regex]::Escape($Project) + '(["\s]|$)'
  @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
      $_.CommandLine -and $_.CommandLine -match 'aix-cli' -and $_.CommandLine -match '\spreview\s' -and $_.CommandLine -match $projectPattern
    })
}

function Invoke-Preview {
  # @() 필수: PowerShell 5.1 에서는 결과가 1개일 때 CimInstance 에 .Count 가 없습니다.
  $running = @(Get-PreviewProcess)
  if ($running.Count -gt 0) {
    Write-Step '미리보기 서버가 이미 실행 중입니다 (새로 띄우지 않음)'
    $firstUrl = $null
    foreach ($process in $running) {
      $ports = @(Get-NetTCPConnection -OwningProcess $process.ProcessId -State Listen -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty LocalPort -Unique)
      foreach ($port in $ports) {
        $url = "http://127.0.0.1:$port/"
        if (-not $firstUrl) { $firstUrl = $url }
        Write-Host "  PID $($process.ProcessId)  $url"
      }
      if ($ports.Count -eq 0) { Write-Host "  PID $($process.ProcessId)  (열린 포트를 찾지 못했습니다)" }
    }
    Write-Note '로컬 웹 미리보기에는 음성 인식 호스트 기능이 설정되어 있지 않습니다. 화면·조작 확인용입니다.'
    Write-Host "  서버를 끝내려면: Stop-Process -Id $($running[0].ProcessId)"
    if ($Open -and $firstUrl) { Start-Process $firstUrl }
    return
  }
  Write-Step '미리보기 서버 시작 (종료: Ctrl+C)'
  Write-Note '로컬 웹 미리보기에는 음성 인식 호스트 기능이 설정되어 있지 않습니다. 화면·조작 확인용입니다.'
  if ($Open) { Invoke-Aix preview $App --dev --launch } else { Invoke-Aix preview $App --dev }
}

function Invoke-Pack {
  Write-Step 'AIX 패키지 만들기'
  Invoke-Aix pack $App -o $AixOut
  if ($LASTEXITCODE -ne 0) { Fail 'AIX 패키징에 실패했습니다.' }
  Invoke-Aix list $AixOut
  if ($LASTEXITCODE -ne 0) { Fail 'AIX 패키지 내용을 읽지 못했습니다.' }
  $item = Get-Item -LiteralPath $AixOut
  Write-Ok ("{0} ({1} bytes, {2})" -f $item.FullName, $item.Length, $item.LastWriteTime)
  Write-Note '이 파일은 로컬 패키지입니다. AIUI Studio 의 클라우드 패키지는 Studio 에서 다시 패키징해야 갱신됩니다.'
}

# ---------------------------------------------------------------- 기기 작업
function Invoke-Devices {
  $adb = Use-Adb
  Write-Step 'ADB'
  Write-Host "  $adb"
  & $adb version | Select-Object -First 2 | ForEach-Object { Write-Host "  $_" }
  Write-Step 'adb devices -l'
  $devices = Get-Devices $adb
  Show-Devices $devices
  Show-DeviceGuidance $devices
}

function Invoke-DeviceInfo {
  $adb = Use-Adb
  $target = Resolve-Serial $adb
  Write-Step "AIUI 기기 상태 (aix device, $target)"
  Invoke-Aix device --serial $target
  if ($LASTEXITCODE -ne 0) { Fail 'aix device 가 실패했습니다.' }
}

function Invoke-Install([string]$Adb, [string]$Target) {
  Write-Step '설치할 Agent 정의 확인 (aix show)'
  Invoke-Aix show $App
  if ($LASTEXITCODE -ne 0) { Fail 'Agent 정의를 만들지 못했습니다.' }
  Write-Step "안경에 설치 (aix install, $Target)"
  Invoke-Aix install $App --serial $Target
  if ($LASTEXITCODE -ne 0) { Fail 'AIX 설치에 실패했습니다. 위 메시지를 확인하세요.' }
  Write-Ok '설치 요청 완료'
}

function Invoke-Launch([string]$Target) {
  Write-Step "페이지 실행 (aix launch-page $Page, $Target)"
  Invoke-Aix launch-page $App $Page --serial $Target
  if ($LASTEXITCODE -ne 0) { Fail '페이지 실행 요청에 실패했습니다. 먼저 install 을 실행했는지 확인하세요.' }
  Write-Ok '실행 요청 전달됨'
  Write-Note '실행 요청이 수락됐다는 뜻일 뿐입니다. 실제 화면 표시와 음성 동작은 안경에서 직접 확인하세요.'
}

function Invoke-Logs {
  $adb = Use-Adb
  $target = Resolve-Serial $adb
  $filter = $DefaultLogPattern
  if ($Pattern) { $filter = $Pattern }
  $logFile = $null
  if ($Save) {
    $logDir = Join-Path $Work 'logs'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $logFile = Join-Path $logDir ("logcat-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  }
  if ($All) { Write-Step "logcat 전체 ($target, 종료: Ctrl+C)" }
  else { Write-Step "logcat 필터: $filter ($target, 종료: Ctrl+C)" }
  if ($logFile) { Write-Note "화면에 보인 줄을 $logFile 에 저장합니다. 기기 로그에는 다른 앱의 정보가 섞일 수 있으니 공유 전에 확인하세요." }
  & $adb -s $target logcat -v threadtime | ForEach-Object {
    if ($All -or $_ -cmatch $filter) {
      Write-Host $_
      if ($logFile) { Add-Content -LiteralPath $logFile -Value $_ -Encoding UTF8 }
    }
  }
}

# ---------------------------------------------------------------- Android 샘플
function Use-AndroidEnv {
  Assert-Path (Join-Path $Jdk 'bin\java.exe') 'JDK 21'
  Assert-Path (Join-Path $Sdk 'platforms') 'Android SDK'
  $env:JAVA_HOME = $Jdk
  $env:ANDROID_HOME = $Sdk
  $env:ANDROID_SDK_ROOT = $Sdk
  $env:GRADLE_USER_HOME = $GradleHome
  $env:Path = "$(Join-Path $Jdk 'bin');$env:Path"
}

function Invoke-AndroidBuild {
  Assert-Path (Join-Path $Sample 'gradlew.bat') '공식 샘플 GlassesBareDevSample'
  Use-AndroidEnv
  Write-Step 'GlassesBareDevSample debug APK 빌드 (:app:assembleDebug)'
  & (Join-Path $Sample 'gradlew.bat') -p $Sample ':app:assembleDebug' --no-daemon --console=plain
  if ($LASTEXITCODE -ne 0) { Fail 'Gradle 빌드에 실패했습니다.' }
  Assert-Path $SampleApk 'debug APK'
  $item = Get-Item -LiteralPath $SampleApk
  Write-Ok ("{0} ({1} bytes, {2})" -f $item.FullName, $item.Length, $item.LastWriteTime)
}

function Invoke-AndroidInstall {
  Assert-Path $SampleApk 'debug APK (먼저 android-build 를 실행하세요)'
  $adb = Use-Adb
  $target = Resolve-Serial $adb
  Confirm-Glasses $adb $target
  Write-Step "APK 설치 (adb install -r, $target)"
  & $adb -s $target install -r $SampleApk
  if ($LASTEXITCODE -ne 0) { Fail 'APK 설치에 실패했습니다.' }
  Write-Ok '설치 완료'
  Write-Host '  실행: rokid-dev.ps1 android-launch'
}

function Invoke-AndroidLaunch {
  $adb = Use-Adb
  $target = Resolve-Serial $adb
  Write-Step "샘플 앱 실행 ($SampleActivity, $target)"
  & $adb -s $target shell am start -n $SampleActivity
  if ($LASTEXITCODE -ne 0) { Fail '앱 실행에 실패했습니다.' }
}

# ---------------------------------------------------------------- 버전
function Show-Versions {
  Write-Step '설치된 도구'
  if (Test-Path -LiteralPath $Node) { Write-Host ("  Node.js        {0}  ({1})" -f (& $Node --version), $Node) } else { Write-Host '  Node.js        없음' }
  $npm = Join-Path $NodeDir 'npm.cmd'
  if (Test-Path -LiteralPath $npm) { Write-Host ("  npm            {0}" -f (& $npm --version)) }
  if (Test-Path -LiteralPath $CliPackageJson) {
    $cliVersion = (Get-Content -LiteralPath $CliPackageJson -Raw -Encoding UTF8 | ConvertFrom-Json).version
    Write-Host ("  AIX CLI        {0}  ({1})" -f $cliVersion, $Cli)
  }
  else { Write-Host '  AIX CLI        없음' }
  $code = Get-Command code.cmd -ErrorAction SilentlyContinue
  if ($code) { Write-Host ("  VS Code        {0}  ({1})" -f (& $code.Source --version | Select-Object -First 1), $code.Source) } else { Write-Host '  VS Code        PATH 에 없음' }
  $adb = Get-AdbPath
  if ($adb) { Write-Host ("  ADB            {0}  ({1})" -f ((& $adb version | Select-Object -Skip 1 -First 1) -replace '^Version\s+', ''), $adb) } else { Write-Host '  ADB            없음' }
  $release = Join-Path $Jdk 'release'
  if (Test-Path -LiteralPath $release) {
    $javaVersion = (Select-String -LiteralPath $release -Pattern '^JAVA_VERSION="(.+)"').Matches[0].Groups[1].Value
    $implementor = (Select-String -LiteralPath $release -Pattern '^IMPLEMENTOR="(.+)"').Matches[0].Groups[1].Value
    Write-Host ("  JDK            {0} {1}  ({2})" -f $implementor, $javaVersion, $Jdk)
  }
  else { Write-Host '  JDK            없음' }
  if (Test-Path -LiteralPath $Sdk) {
    $packages = @()
    foreach ($group in 'platforms', 'build-tools', 'platform-tools') {
      $dir = Join-Path $Sdk $group
      if (-not (Test-Path -LiteralPath $dir)) { continue }
      if ($group -eq 'platform-tools') { $packages += 'platform-tools' }
      else { $packages += @(Get-ChildItem -LiteralPath $dir -Directory | ForEach-Object { "$group/$($_.Name)" }) }
    }
    $cmdlineProps = Join-Path $Sdk 'cmdline-tools\latest\source.properties'
    if (Test-Path -LiteralPath $cmdlineProps) {
      $packages += "cmdline-tools/" + ((Select-String -LiteralPath $cmdlineProps -Pattern '^Pkg\.Revision=(.+)$').Matches[0].Groups[1].Value)
    }
    Write-Host ("  Android SDK    {0}  ({1})" -f ($packages -join ', '), $Sdk)
  }
  else { Write-Host '  Android SDK    없음' }
  $wrapper = Join-Path $Sample 'gradle\wrapper\gradle-wrapper.properties'
  if (Test-Path -LiteralPath $wrapper) {
    $gradle = (Select-String -LiteralPath $wrapper -Pattern 'gradle-([0-9.]+)-bin\.zip').Matches[0].Groups[1].Value
    Write-Host ("  Gradle         {0} (샘플 wrapper, 캐시: {1})" -f $gradle, $GradleHome)
  }
  Write-Host ''
  Write-Host "  앱 소스        $App"
  Write-Host "  Android 샘플   $Sample"
}

function Show-Help {
  Write-Host @"
Rokid Glasses 개발 스크립트

  powershell -NoProfile -ExecutionPolicy Bypass -File "$PSCommandPath" <작업> [옵션]

AIUI 앱 (케이블 불필요)
  check            구문 / JSON·페이지 구성 / 모의 API 제어 로직 / 패키징 사전 검사
  test             모의 API 제어 로직 검사만
  preview [-Open]  로컬 화면 미리보기 (이미 실행 중이면 주소만 표시)
  pack             outputs\<앱 폴더>.aix 생성

안경 (개발용 데이터 케이블 + 휴대폰 앱에서 ADB 켜기 필요)
  devices          adb devices -l 와 상태별 안내
  device-info      aix device (개발자 모드, 설치된 Agent)
  install          aix show + aix install
  launch           aix launch-page [-Page pages/index/index]
  install-launch   설치 후 페이지 실행
  logs             logcat [-Pattern <정규식>] [-All] [-Save]

Android 독립 앱 (공식 샘플 GlassesBareDevSample)
  android-build    debug APK 빌드
  android-install  adb install -r
  android-launch   샘플 앱 실행

기타
  versions         설치된 도구와 버전

공통 옵션
  -Project <폴더>  outputs 아래의 AIUI 앱 폴더 (기본 speak-english)
  -Serial <serial> 대상 기기 지정. 생략 시 ANDROID_SERIAL, work\device-serial.txt, 단일 기기 순으로 선택
  -Force           기기 식별 검사(Rokid / Android 12)를 건너뜀
"@
}

switch ($Action) {
  'help' { Show-Help }
  'versions' { Show-Versions }
  'check' { Invoke-Check }
  'test' { Invoke-Tests }
  'preview' { Invoke-Preview }
  'pack' { Invoke-Pack }
  'devices' { Invoke-Devices }
  'device-info' { Invoke-DeviceInfo }
  'install' {
    $adb = Use-Adb
    $target = Resolve-Serial $adb
    Confirm-Glasses $adb $target
    Invoke-Install $adb $target
  }
  'launch' {
    $adb = Use-Adb
    $target = Resolve-Serial $adb
    Invoke-Launch $target
  }
  'install-launch' {
    $adb = Use-Adb
    $target = Resolve-Serial $adb
    Confirm-Glasses $adb $target
    Invoke-Install $adb $target
    Invoke-Launch $target
  }
  'logs' { Invoke-Logs }
  'android-build' { Invoke-AndroidBuild }
  'android-install' { Invoke-AndroidInstall }
  'android-launch' { Invoke-AndroidLaunch }
}
