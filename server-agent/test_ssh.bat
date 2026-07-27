@echo off
setlocal
chcp 65001 >nul

echo [1/2] JBNU gateway passwordless login test...
ssh -o BatchMode=yes -o ConnectTimeout=8 skylark@lion.jbnu.ac.kr "hostname"
if errorlevel 1 goto GATEWAY_FAIL

echo.
echo [2/2] gateway to lion28 passwordless login test...
ssh -o ConnectTimeout=8 skylark@lion.jbnu.ac.kr "ssh -o BatchMode=yes -o ConnectTimeout=8 lion28 hostname"
if errorlevel 1 goto NODE_FAIL

echo.
echo SUCCESS: Lion Agent can use passwordless SSH.
echo Run run_agent.bat and connect from the YS Empire page.
pause
exit /b 0

:GATEWAY_FAIL
echo.
echo FAILED: Windows cannot log in to skylark@lion.jbnu.ac.kr without a password.
echo Open agent-setup.html and register your public SSH key first.
pause
exit /b 1

:NODE_FAIL
echo.
echo FAILED: The gateway login worked, but the gateway cannot reach lion28 without interaction.
echo Log in to the gateway manually once and test: ssh lion28 hostname
pause
exit /b 2
