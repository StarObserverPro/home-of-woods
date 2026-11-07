@echo off
schtasks /Run /TN "HomeOfWoods-Local-5286" >nul 2>&1
if errorlevel 1 (
  start "" wscript.exe //B //NoLogo "%~dp0tools\run-local.vbs"
)
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5286/"
