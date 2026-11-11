#!/bin/bash
set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$PROJECT_DIR/backend"

echo "[1/8] Instalando dependencias..."
sudo apt-get update
sudo apt-get install -y nodejs npm unclutter chromium-browser || sudo apt-get install -y nodejs npm unclutter chromium

echo "[2/8] npm install..."
cd "$BACKEND"
npm install

echo "[3/8] Generando servicio backend..."
sudo tee /etc/systemd/system/followcount-backend.service >/dev/null <<EOF
[Unit]
Description=followCount Backend
After=network.target

[Service]
WorkingDirectory=$BACKEND
ExecStart=/usr/bin/npm start
Restart=always
User=$USER

[Install]
WantedBy=multi-user.target
EOF

CHROMIUM=$(command -v chromium-browser || command -v chromium)

echo "[4/8] Generando servicio kiosco..."
sudo tee /etc/systemd/system/followcount-kiosk.service >/dev/null <<EOF
[Unit]
Description=followCount Kiosk
After=graphical.target followcount-backend.service

[Service]
Environment=DISPLAY=:0
ExecStartPre=/bin/sh -c 'unclutter -idle 0 -root & exit 0'
ExecStartPre=-/usr/bin/xset s off
ExecStartPre=-/usr/bin/xset s noblank
ExecStartPre=-/usr/bin/xset -dpms
ExecStart=$CHROMIUM --kiosk --noerrdialogs --disable-infobars --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding http://localhost:3000
Restart=always
User=$USER

[Install]
WantedBy=graphical.target
EOF

echo "[5/8] Instalando vigilantes del kiosco y de la red..."
chmod +x "$PROJECT_DIR/deploy/kiosk-watchdog.sh"
for unit in followcount-kiosk-watchdog.service followcount-kiosk-watchdog.timer; do
    sed "s|/home/info/followCount|$PROJECT_DIR|g" "$PROJECT_DIR/deploy/systemd/$unit"         | sudo tee "/etc/systemd/system/$unit" >/dev/null
done

chmod +x "$PROJECT_DIR/deploy/net-watchdog.sh"
for unit in followcount-net-watchdog.service followcount-net-watchdog.timer; do
    sed "s|/home/info/followCount|$PROJECT_DIR|g" "$PROJECT_DIR/deploy/systemd/$unit" | sudo tee "/etc/systemd/system/$unit" >/dev/null
done

echo "[6/8] Dejando el journal persistente..."
# Sin esto el journal es volatil y un reinicio se lleva la evidencia.
sudo mkdir -p /var/log/journal /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/followcount.conf >/dev/null <<EOF
[Journal]
Storage=persistent
SystemMaxUse=50M
EOF
sudo systemd-tmpfiles --create --prefix /var/log/journal || true
sudo systemctl restart systemd-journald || true
# Reiniciar journald no basta en caliente: sin el flush sigue escribiendo en
# /run/log/journal (memoria) hasta el siguiente arranque.
sudo journalctl --flush || true

echo "[7/8] Activando servicios..."
sudo systemctl daemon-reload
sudo systemctl enable followcount-backend.service
sudo systemctl enable followcount-kiosk.service
sudo systemctl enable --now followcount-kiosk-watchdog.timer
sudo systemctl enable --now followcount-net-watchdog.timer
sudo systemctl restart followcount-backend.service || true

echo "[8/8] Instalación finalizada."
