@echo off
rem Deploy the recipe book to the server: last git commit -> /opt/recipes/app -> docker.
rem SSH will ask for the key passphrase once.
cd /d "%~dp0.."
if not defined RECIPES_KEY set "RECIPES_KEY=%USERPROFILE%\Documents\Codex\2026-09-02\files-pasted-by-the-user-senior\work\tutormate-deploy-key"
echo Sending the last commit to the server...
git archive --format=tar.gz HEAD | ssh -i "%RECIPES_KEY%" -o IdentitiesOnly=yes root@95.217.133.58 "rm -rf /opt/recipes/app.new && mkdir -p /opt/recipes/app.new && tar -xzf - -C /opt/recipes/app.new && rm -rf /opt/recipes/app && mv /opt/recipes/app.new /opt/recipes/app && bash /opt/recipes/app/deploy/server-deploy.sh"
echo.
pause
