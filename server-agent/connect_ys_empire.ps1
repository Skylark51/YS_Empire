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

function Test-GatewayKey([string]$Target) {
    & ssh -o BatchMode=yes -o ConnectTimeout=8 $Target 'hostname' >$null 2>&1
    return $LASTEXITCODE -eq 0
}

function Ensure-SshKey {
    $sshDirectory = Join-Path $env:USERPROFILE '.ssh'
    $keyPath = Join-Path $sshDirectory 'id_ed25519'
    $publicKeyPath = "$keyPath.pub"

    if (-not (Test-Path $sshDirectory)) {
        New-Item -ItemType Directory -Path $sshDirectory | Out-Null
    }

    if (-not (Test-Path $keyPath) -or -not (Test-Path $publicKeyPath)) {
        Write-Step '자동 연결용 SSH 키를 생성합니다.'
        & ssh-keygen -q -t ed25519 -N '""' -f $keyPath -C 'ys-empire-lion'
        if ($LASTEXITCODE -ne 0) { throw 'SSH 키 생성에 실패했습니다.' }
    }

    return $publicKeyPath
}

function Register-GatewayKey([string]$Target, [string]$PublicKeyPath) {
    Write-Step 'Lion 로그인 비밀번호를 한 번 입력해 공개키를 등록합니다.'
    Write-Host '아래 비밀번호 입력은 웹페이지 토큰이 아니라 실제 Lion SSH 로그인 비밀번호입니다.' -ForegroundColor Yellow
    Get-Content -Raw -Encoding UTF8 $PublicKeyPath |
        & ssh -o ConnectTimeout=15 $Target 'umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; cat >> ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys'
    if ($LASTEXITCODE -ne 0) { throw 'Lion 게이트웨이에 SSH 공개키를 등록하지 못했습니다.' }
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
if (-not (Test-GatewayKey $gatewayTarget)) {
    $publicKeyPath = Ensure-SshKey
    Register-GatewayKey $gatewayTarget $publicKeyPath
    if (-not (Test-GatewayKey $gatewayTarget)) {
        throw '공개키 등록 후에도 자동 로그인이 실패했습니다. 입력한 Lion 비밀번호와 계정을 확인하세요.'
    }
}
Write-Host '게이트웨이 SSH 자동 로그인 확인 완료.' -ForegroundColor Green

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

Write-Host "`n연결이 완료되었습니다. 이후 같은 브라우저에서는 Agent가 실행 중이면 자동으로 Lion 실시간 상태가 적용됩니다." -ForegroundColor Green
Write-Host '웹페이지에서 다시 묻는 값은 Lion 비밀번호가 아니라 config.json의 api_token입니다.' -ForegroundColor Yellow
