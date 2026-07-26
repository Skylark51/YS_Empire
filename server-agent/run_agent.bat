@echo off
setlocal
cd /d "%~dp0"

if exist "config.json" goto RUN_AGENT
copy /Y "config.example.json" "config.json" >nul
echo Created config.json.
echo Open config.json and replace the api_token value.
start "" notepad.exe "config.json"
pause
exit /b 0

:RUN_AGENT
where py >nul 2>nul
if errorlevel 1 goto USE_PYTHON
py -3 "gateway_agent.py"
goto FINISH

:USE_PYTHON
python "gateway_agent.py"

:FINISH
if errorlevel 1 pause
endlocal
