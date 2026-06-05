@echo off
title TransFPS - LAN
echo ===========================================
echo   TransFPS - Jogar em REDE LOCAL (LAN)
echo ===========================================
echo.
echo [1/3] Subindo o servidor multiplayer (Colyseus :2567)...
start "TransFPS Colyseus" cmd /k "cd tools\transfps-colyseus && npm install && npm start"
timeout /t 4 /nobreak >nul

echo [2/3] Subindo o config-server (:3099, so no host)...
start "TransFPS Config" cmd /k "node tools/config-server.js"
timeout /t 1 /nobreak >nul

echo [3/3] Subindo o servidor do jogo (HTTP :5500)...
start "TransFPS Game" cmd /k "npx serve -s . -l 5500"
timeout /t 3 /nobreak >nul

echo.
echo ===========================================
echo   SEU IP NA REDE LOCAL (procure o IPv4):
echo -------------------------------------------
ipconfig | findstr /i "IPv4"
echo ===========================================
echo.
echo   VOCE joga em:        http://localhost:5500
echo   Os OUTROS PCs em:    http://SEU-IP:5500
echo                        (ex.: http://192.168.0.10:5500)
echo.
echo   O jogo detecta a LAN sozinho e conecta no
echo   Colyseus deste mesmo PC (ws://SEU-IP:2567).
echo.
echo   IMPORTANTE: quando o Windows perguntar do Firewall,
echo   marque REDE PRIVADA e clique em PERMITIR (Node.js).
echo ===========================================
echo.
start http://localhost:5500
echo (Feche as janelas dos servidores para parar tudo.)
pause
