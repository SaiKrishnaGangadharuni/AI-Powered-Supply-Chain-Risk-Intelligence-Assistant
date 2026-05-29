@echo off
REM ---- Launcher: adds bundled Node to PATH for this window, then runs the dev server ----
set "PATH=%PATH%;D:\FDE_Trainings\AFDE_GSK_Learnings\FDE_GSK_Practice\projects\node-v24.15.0-win-x64"
cd /d "D:\FDE_Trainings\capstone_project\AI-Powered-Supply-Chain-Risk-Intelligence-Assistant\frontend"
echo Node version:
node -v
echo Installing dependencies (first run only, may take a minute)...
call npm install --no-audit --no-fund
echo Starting Vite dev server at http://localhost:5173 ...
call npm run dev
