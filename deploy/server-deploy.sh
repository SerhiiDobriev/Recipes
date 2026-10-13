#!/usr/bin/env bash
# Runs on the server as root after the code is unpacked to /opt/recipes/app.
# Safe to run again: data in /opt/recipes/data is never touched, nginx and https are set up only once.
set -euo pipefail

APP=/opt/recipes/app
DATA=/opt/recipes/data
DOMAIN=recipes.tutormate.site

echo "== 1/4 data folder"
mkdir -p "$DATA"
chown -R 1000:1000 "$DATA"   # the container runs as user "node" (uid 1000)

echo "== 2/4 build and start the container"
cd "$APP"
docker compose -p recipes up -d --build
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3200/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3200/api/health && echo

echo "== 3/4 nginx"
if [ -d /etc/nginx/sites-enabled ]; then
  SITE=/etc/nginx/sites-available/$DOMAIN
  LINK=/etc/nginx/sites-enabled/$DOMAIN
else
  SITE=/etc/nginx/conf.d/$DOMAIN.conf
  LINK=
fi
if [ ! -f "$SITE" ]; then
  cp deploy/nginx-recipes.conf "$SITE"
  [ -n "$LINK" ] && ln -sf "$SITE" "$LINK"
  nginx -t
  systemctl reload nginx
  echo "nginx: added $DOMAIN"
else
  echo "nginx: $DOMAIN already configured"
fi

echo "== 4/4 https"
if certbot certificates 2>/dev/null | grep -q "Domains:.*$DOMAIN"; then
  echo "https: certificate already exists"
else
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
fi

echo
echo "DONE: https://$DOMAIN"
