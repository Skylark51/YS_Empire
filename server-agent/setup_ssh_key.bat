@echo off
chcp 65001 > nul
setlocal
where ssh >nul 2>nul || (
  echo [오류] Windows OpenSSH Client가 필요합니다.
  echo 설정 ^> 선택적 기능 ^> OpenSSH Client를 설치하세요.
  pause
  exit /b 1
)
if not exist "%USERPROFILE%\.ssh\id_ed25519" (
  echo SSH 키를 생성합니다. 자동 수집용이면 passphrase를 비워둘 수 있습니다.
  ssh-keygen -t ed25519 -f "%USERPROFILE%\.ssh\id_ed25519" -C "ys-empire-agent"
)
echo.
echo 아래 공개키를 Lion 계정의 ~/.ssh/authorized_keys 에 한 줄로 추가하십시오.
echo ----------------------------------------------------------------
type "%USERPROFILE%\.ssh\id_ed25519.pub"
echo ----------------------------------------------------------------
echo.
echo 테스트: ssh -o BatchMode=yes lion51 hostname
pause
