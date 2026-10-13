@echo off
rem Deploy the recipe book to the server: last git commit -> /opt/recipes/app -> docker.
rem Uses the TutorMate GitHub Actions deploy key (already trusted by the server).
rem Another key: set RECIPES_KEY=path\to\key before running.
cd /d "%~dp0.."
if not defined RECIPES_KEY set "RECIPES_KEY=%USERPROFILE%\Documents\Codex\2026-09-12\handoff-for-next-agent-md-x20-2\work\deploy-key\tutormate-github-actions"
rem Git's ssh does not reject keys because of Windows file permissions
set "SSH=ssh"
if exist "%ProgramFiles%\Git\usr\bin\ssh.exe" set "SSH=%ProgramFiles%\Git\usr\bin\ssh.exe"
echo Sending the last commit to the server...
git archive --format=tar.gz HEAD | "%SSH%" -i "%RECIPES_KEY%" -o IdentitiesOnly=yes root@95.217.133.58 "rm -rf /opt/recipes/app.new && mkdir -p /opt/recipes/app.new && tar -xzf - -C /opt/recipes/app.new && rm -rf /opt/recipes/app && mv /opt/recipes/app.new /opt/recipes/app && bash /opt/recipes/app/deploy/server-deploy.sh"
echo.
pause
