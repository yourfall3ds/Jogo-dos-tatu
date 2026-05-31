@echo off
echo ===========================================
echo   TransFPS - Iniciando servidores...
echo ===========================================
echo.

:: Inicia o config-server (porta 3099) em segundo plano
echo [1/2] Iniciando config-server (porta 3099)...
start "TransFPS Config Server" cmd /c "node tools/config-server.js"

:: Aguarda 1 segundo para o servidor subir
timeout /t 1 /nobreak >nul

:: Inicia o servidor de assets (porta 5500 via serve)
echo [2/2] Iniciando servidor de assets...
start "TransFPS Assets Server" cmd /c "npx serve -s . -l 5500"

:: Aguarda um segundo e abre o navegador
timeout /t 2 /nobreak >nul
echo.
echo Abrindo o jogo no navegador...
start http://localhost:5500

echo.
echo Servidores rodando! Feche esta janela para parar tudo.
echo (As janelas dos servidores continuam abertas)
pause
