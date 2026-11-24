@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-cloudfunction.ps1"
pause
