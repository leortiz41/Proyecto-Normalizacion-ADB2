@echo off
title Iniciar Normalizacion (Frontend + Backend)
start "BACKEND" cmd /k "cd /d C:\dev\normalizacion-backend-sqlserver && npm start"
timeout /t 3 > nul
start "FRONTEND" cmd /k "cd /d C:\dev\normalizacion-react && npm run dev"
