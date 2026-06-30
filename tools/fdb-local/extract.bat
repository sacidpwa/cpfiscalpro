@echo off
REM Doble clic en este archivo para extraer un .FDB a CSV.
REM Te pedirá la ruta del .FDB.

setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: no se pudo instalar. Verifica que Node.js esté instalado (https://nodejs.org).
    pause
    exit /b 1
  )
)

set /p FDB="Arrastra aquí tu archivo .FDB y presiona Enter: "
set FDB=%FDB:"=%

node extract.js "%FDB%" salida
echo.
pause
