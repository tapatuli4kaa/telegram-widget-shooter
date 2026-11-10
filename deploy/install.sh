#!/bin/sh
# Installs or updates the bot on an Ubuntu server with Node 18+. Run as root:
#   sh deploy/install.sh        (then put BOT_TOKEN into /opt/telegram-widget-shooter/.env)
set -e
DIR=/opt/telegram-widget-shooter
REPO=https://github.com/tapatuli4kaa/telegram-widget-shooter.git
id widgetbot >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin widgetbot
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi
[ -f "$DIR/.env" ] || cp "$DIR/.env.example" "$DIR/.env"
chown root:widgetbot "$DIR/.env" && chmod 640 "$DIR/.env"
cp "$DIR/deploy/widget-shooter.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable widget-shooter
systemctl restart widget-shooter
