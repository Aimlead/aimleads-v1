@echo off
setlocal

set "NODEJS_DIR=C:\Program Files\nodejs"
set "NPM_CMD=%NODEJS_DIR%\npm.cmd"

if not exist "%NPM_CMD%" (
  echo [ERROR] Node/npm introuvable dans "%NODEJS_DIR%".
  echo Installe Node.js LTS puis relance.
  exit /b 1
)

set "PATH=%NODEJS_DIR%;%PATH%"
call "%NPM_CMD%" run dev:full
