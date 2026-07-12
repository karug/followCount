#!/bin/bash
set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$PROJECT_DIR/backend"

echo "[1/6] Instalando dependencias..."
sudo apt-get update
sudo apt-get install -y nodejs npm unclutter chromium-browser || sudo apt-get install -y nodejs npm unclutter chromium

echo "[2/6] npm install..."
cd "$BACKEND"
npm install

echo "[3/6] Generando servicio backend..."
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

echo "[4/6] Generando servicio kiosco..."
sudo tee /etc/systemd/system/followcount-kiosk.service >/dev/null <<EOF
[Unit]
Description=followCount Kiosk
After=graphical.target followcount-backend.service

[Service]
Environment=DISPLAY=:0
ExecStartPre=/bin/sh -c 'unclutter -idle 0 -root & exit 0'
ExecStart=$CHROMIUM --kiosk --noerrdialogs --disable-infobars http://localhost:3000
Restart=always
User=$USER

[Install]
WantedBy=graphical.target
EOF

echo "[5/6] Activando servicios..."
sudo systemctl daemon-reload
sudo systemctl enable followcount-backend.service
sudo systemctl enable followcount-kiosk.service
sudo systemctl restart followcount-backend.service || true

echo "[6/6] Instalación finalizada."
