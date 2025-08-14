@echo off
title Setup Normalizacion (Frontend + Backend)
if not exist "C:\dev" mkdir "C:\dev"
if not exist "C:\dev\normalizacion-backend-sqlserver" echo ERROR: Falta carpeta backend en C:\dev && pause && exit /b 1
if not exist "C:\dev\normalizacion-react" echo ERROR: Falta carpeta frontend en C:\dev && pause && exit /b 1

cd /d C:\dev\normalizacion-backend-sqlserver
if not exist node_modules npm install
if not exist .env if exist .env.example copy /Y .env.example .env

cd /d C:\dev\normalizacion-react
if not exist node_modules npm install
if not exist .env if exist .env.example copy /Y .env.example .env

echo Listo. Edita C:\dev\normalizacion-backend-sqlserver\.env y ejecuta levantar_todo.bat
pause
