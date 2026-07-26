@echo off
chcp 65001 > nul
cd /d "%~dp0"
if not exist config.json (
  copy /Y config.example.json config.json >nul
  echo config.json을 만들었습니다.
  echo api_token을 변경하고 필요한 노드만 남긴 뒤 다시 실행하세요.
  echo 기본 접속 경로는 lion.jbnu.ac.kr ^> ssh lionXX 입니다.
  notepad config.json
  pause
  exit /b 0
)
python gateway_agent.py
if errorlevel 1 pause
