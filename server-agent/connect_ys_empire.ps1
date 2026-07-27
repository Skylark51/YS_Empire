$ErrorActionPreference = 'Stop'

$AgentRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $AgentRoot 'config.json'
$ExamplePath = Join-Path $AgentRoot 'config.example.json'
$PageUrl = 'https://skylark51.github.io/YS_Empire/'

function Write-Step([string]$Message) {
    Write-Host "`n[YS Empire] $Message" -ForegroundColor Cyan
}

function New-AgentToken {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Save-JsonWithoutBom($Object, [string]$Path) {
    $json = $Object | ConvertTo-Json -Depth 20
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8)
}

function Test-AgentHealth {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

Set-Location $AgentRoot

Write-Step '로컬 설정을 준비합니다.'
if (-not (Test-Path $ConfigPath)) {
    if (-not (Test-Path $ExamplePath)) {
        throw 'config.example.json을 찾을 수 없습니다.'
    }
    Copy-Item $ExamplePath $ConfigPath
}

$config = Get-Content -Raw -Encoding UTF8 $ConfigPath | ConvertFrom-Json
$token = [string]$config.api_token
if ([string]::IsNullOrWhiteSpace($token) -or $token -eq 'CHANGE_ME_TO_A_LONG_RANDOM_TOKEN') {
    $token = New-AgentToken
    $config.api_token = $token
    Save-JsonWithoutBom $config $ConfigPath
    Write-Host '새 Agent 접근 토큰을 config.json에 생성했습니다.' -ForegroundColor Green
}

$gateway = if ($config.gateway) { [string]$config.gateway } else { 'lion.jbnu.ac.kr' }
$gatewayUser = if ($config.gateway_user) { [string]$config.gateway_user } else { 'skylark' }
$gatewayTarget = "$gatewayUser@$gateway"

Write-Step "SSH 자동 로그인을 확인합니다: $gatewayTarget"
& ssh -o BatchMode=yes -o ConnectTimeout=8 $gatewayTarget 'hostname'
if ($LASTEXITCODE -ne 0) {
    throw "게이트웨이 SSH 키 로그인이 실패했습니다. server-agent\test_ssh.bat을 먼저 실행하세요."
}

Write-Step '게이트웨이에서 lion28 내부 접속을 확인합니다.'
& ssh -o BatchMode=yes -o ConnectTimeout=8 $gatewayTarget 'ssh -o BatchMode=yes -o ConnectTimeout=8 lion28 hostname'
if ($LASTEXITCODE -ne 0) {
    throw '게이트웨이에서 lion28로 비대화식 접속하지 못했습니다.'
}

if (-not (Test-AgentHealth)) {
    Write-Step 'Lion Agent를 시작합니다.'
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        Start-Process -FilePath $py.Source -ArgumentList @('-3', 'gateway_agent.py') -WorkingDirectory $AgentRoot
    } else {
        $python = Get-Command python -ErrorAction SilentlyContinue
        if (-not $python) { throw 'Python을 찾을 수 없습니다. Python 3을 설치하세요.' }
        Start-Process -FilePath $python.Source -ArgumentList @('gateway_agent.py') -WorkingDirectory $AgentRoot
    }

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 500
        if (Test-AgentHealth) { $ready = $true; break }
    }
    if (-not $ready) { throw 'Lion Agent가 15초 안에 시작되지 않았습니다.' }
} else {
    Write-Host '기존 Lion Agent가 이미 실행 중입니다.' -ForegroundColor Green
}

Write-Step '영섭랜드를 열고 자동 연결합니다.'
$endpoint = [Uri]::EscapeDataString('http://127.0.0.1:8765')
$encodedToken = [Uri]::EscapeDataString($token)
$connectUrl = "${PageUrl}#ys_endpoint=$endpoint&ys_token=$encodedToken&ys_poll=10000"
Start-Process $connectUrl

Write-Host "`n연결 창을 열었습니다. 이 PowerShell 창은 닫아도 되지만, 별도로 열린 Lion Agent 창은 유지하세요." -ForegroundColor Green
