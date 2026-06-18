#!/bin/bash
# ============================================================
#  OpenFinder — Production Bare-Metal Installer
#  Targets: Ubuntu 22.04+ / Debian 12+
#  Architecture: Nginx → Node.js/Express + Next.js (SSR)
# ============================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; exit 1; }

# Trap any error with the line number so failures are never silent
cleanup_on_failure() {
  echo -e "\n${RED}${BOLD}❌ Installation failed at line $1.${NC}"
  echo -e "${RED}   Rolling back systemd service if it was started...${NC}"
  systemctl stop openfinder 2>/dev/null || true
  echo -e "${YELLOW}   Run: journalctl -u openfinder -n 50 for logs.${NC}"
  exit 1
}
trap 'cleanup_on_failure $LINENO' ERR

# ── Root check ────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  fail "Please run as root: sudo bash install.sh"
fi

echo -e "${BOLD}"
echo "  ██████╗ ██████╗ ███████╗███╗   ██╗███████╗██╗███╗   ██╗██████╗ ███████╗██████╗ "
echo " ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██║████╗  ██║██╔══██╗██╔════╝██╔══██╗"
echo " ██║   ██║██████╔╝█████╗  ██╔██╗ ██║█████╗  ██║██╔██╗ ██║██║  ██║█████╗  ██████╔╝"
echo " ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██╔══╝  ██║██║╚██╗██║██║  ██║██╔══╝  ██╔══██╗"
echo " ╚██████╔╝██║     ███████╗██║ ╚████║██║     ██║██║ ╚████║██████╔╝███████╗██║  ██║"
echo "  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚═╝     ╚═╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═╝"
echo -e "${NC}"
echo -e "  ${BOLD}Production Homelab OS Installer${NC} — Ubuntu/Debian"
echo ""

# ── 1. System packages ────────────────────────────────────────
log "Installing system dependencies..."
apt-get update -qq
apt-get install -y \
  curl git nginx samba ntfs-3g exfatprogs \
  util-linux build-essential python3-dev \
  ffmpeg tesseract-ocr tesseract-ocr-eng poppler-utils \
  > /dev/null 2>&1

log "Speed Core media tools installed: ffmpeg, Tesseract OCR, Poppler PDF tools."

# ── 2. Node.js 22 LTS ─────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 22 ]]; then
  log "Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
  apt-get install -y nodejs > /dev/null 2>&1
else
  log "Node.js $(node -v) already installed."
fi

# ── 3. App directory & clone/update ──────────────────────────
INSTALL_DIR="/opt/openfinder"
REPO_URL="https://github.com/abdlx/OpenFinder-shell.git"
COOLIFY_ENABLED="${COOLIFY_ENABLED:-true}"
COOLIFY_APP_PORT="${COOLIFY_APP_PORT:-8000}"
COOLIFY_DATA_DIR="${COOLIFY_DATA_DIR:-/data/coolify}"

if [ -d "$INSTALL_DIR/.git" ]; then
  log "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --quiet
else
  log "Cloning OpenFinder to $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR" --quiet
  cd "$INSTALL_DIR"
fi

# ── 4. Install npm dependencies & build ───────────────────────
log "Installing Node.js packages..."
npm install --legacy-peer-deps --silent

log "Verifying Speed Core Node package support..."
node -e "import('sharp').then(() => console.log('sharp ok')).catch((err) => { console.error('sharp failed:', err.message); process.exit(1); })"

log "Building production Next.js bundle..."
npm run build

chmod +x "$INSTALL_DIR/scripts/coolify-up.sh" "$INSTALL_DIR/scripts/coolify-down.sh" 2>/dev/null || true

if [ "$COOLIFY_ENABLED" = "true" ]; then
  log "Starting bundled Coolify sidecar..."
  COOLIFY_APP_PORT="$COOLIFY_APP_PORT" COOLIFY_DATA_DIR="$COOLIFY_DATA_DIR" bash "$INSTALL_DIR/scripts/coolify-up.sh"
else
  warn "Coolify sidecar disabled (COOLIFY_ENABLED=false)."
fi

# ── 5. Create data directories ───────────────────────────────
log "Provisioning runtime directories..."
mkdir -p \
  "$INSTALL_DIR/data/.tus_uploads" \
  /mnt/openfinder-storage   # Default isolated storage for Samba shares

chmod 755 /mnt/openfinder-storage
chmod -R 700 "$INSTALL_DIR/data"  # Protect the SQLite database from other users

# ── 6. Systemd service ───────────────────────────────────────
log "Creating systemd service (openfinder.service)..."
# Generate a stable APP_KEY for AES-256-GCM encryption of secrets at rest.
# This key protects SSH private keys, S3 credentials, and env var values.
# Persisted here so it survives data/ wipes — losing it = losing all secrets.
APP_KEY_FILE="$INSTALL_DIR/data/.app_key"
mkdir -p "$INSTALL_DIR/data"
if [ ! -f "$APP_KEY_FILE" ]; then
  APP_KEY=$(openssl rand -hex 32)
  echo -n "$APP_KEY" > "$APP_KEY_FILE"
  chmod 600 "$APP_KEY_FILE"
  log "Generated new APP_KEY and saved to $APP_KEY_FILE"
else
  APP_KEY=$(cat "$APP_KEY_FILE")
  log "Using existing APP_KEY from $APP_KEY_FILE"
fi

cat > /etc/systemd/system/openfinder.service <<EOF
[Unit]
Description=OpenFinder Homelab OS
Documentation=https://github.com/abdlx/OpenFinder
After=network.target

[Service]
Type=simple
# Root is required for: mount syscalls, lsblk, smb.conf regeneration
User=root
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATABASE_URL=$INSTALL_DIR/data/filemanager.db
Environment=TUS_UPLOAD_DIR=$INSTALL_DIR/data/.tus_uploads
Environment=ROOT_DIR=/
Environment=APP_KEY=$APP_KEY
ExecStart=/usr/bin/npm start
# Auto-restart on crash with 5s delay
Restart=on-failure
RestartSec=5
# Logging to systemd journal
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openfinder

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable openfinder --quiet
systemctl restart openfinder
log "OpenFinder Node.js service started."

# ── 7. Samba — isolated storage only, no root share ──────────
log "Configuring secured Samba share..."
[ -f /etc/samba/smb.conf ] && cp /etc/samba/smb.conf /etc/samba/smb.conf.bak

cat > /etc/samba/smb.conf <<EOF
[global]
   workgroup = WORKGROUP
   server string = OpenFinder Storage Hub
   server role = standalone server
   map to guest = bad user
   log file = /var/log/samba/log.%m
   max log size = 500
   logging = file

[OpenFinder-Storage]
   comment = OpenFinder Managed Storage
   # Only share the isolated storage dir — NOT the root filesystem
   path = /mnt/openfinder-storage
   browsable = yes
   writable = yes
   guest ok = yes
   read only = no
   create mask = 0664
   directory mask = 0775
   force user = root
EOF

systemctl enable smbd --quiet
systemctl restart smbd
log "Samba configured — sharing /mnt/openfinder-storage only."

# ── 8. Install & configure code-server ───────────────────────
log "Installing code-server..."
if ! command -v code-server &>/dev/null; then
  curl -fsSL https://code-server.dev/install.sh | sh > /dev/null 2>&1
fi

cat > /etc/systemd/system/code-server.service <<EOF
[Unit]
Description=code-server
After=network.target

[Service]
Type=simple
User=root
Environment=PASSWORD=
ExecStart=/usr/bin/code-server --bind-addr 127.0.0.1:8080 --auth none
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable code-server --quiet
systemctl restart code-server
log "code-server configured on port 8080."

# ── 9. Nginx reverse proxy ───────────────────────────────────
# NOTE: This app uses Next.js SSR (getServerSideProps), so we CANNOT
# use 'output: export'. Nginx proxies ALL traffic to the Node.js process.
log "Configuring Nginx reverse proxy..."
cat > /etc/nginx/sites-available/openfinder <<'NGINXEOF'
server {
    listen 80;
    server_name _;

    # Increase upload buffer for large file uploads via TUS
    client_max_body_size 0;
    proxy_request_buffering off;

    # All traffic (SSR pages + API) goes to the Node.js process
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        # Extended timeouts for TUS resumable uploads (multi-GB files)
        proxy_read_timeout 36000s;
        proxy_send_timeout 36000s;
        send_timeout 36000s;
    }

    # Internal code-server proxy
    location /code/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGINXEOF

# Disable the default Nginx site and enable ours
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/openfinder /etc/nginx/sites-enabled/

nginx -t && systemctl restart nginx
log "Nginx configured — proxying port 80 → Node.js :3000"

# ── 10. Auto-update script ────────────────────────────────────
cat > /usr/local/bin/openfinder-update <<UPDATEEOF
#!/bin/bash
set -e

cd $INSTALL_DIR
git pull
apt-get update -qq
apt-get install -y ffmpeg tesseract-ocr tesseract-ocr-eng poppler-utils > /dev/null 2>&1
npm install --legacy-peer-deps --silent
node -e "import('sharp').catch((err) => { console.error('sharp failed:', err.message); process.exit(1); })"
npm run build

chmod +x $INSTALL_DIR/scripts/coolify-up.sh $INSTALL_DIR/scripts/coolify-down.sh 2>/dev/null || true
if [ "\${COOLIFY_ENABLED:-true}" = "true" ]; then
  COOLIFY_APP_PORT="\${COOLIFY_APP_PORT:-8000}" COOLIFY_DATA_DIR="\${COOLIFY_DATA_DIR:-/data/coolify}" bash $INSTALL_DIR/scripts/coolify-up.sh
fi

if command -v code-server &>/dev/null; then
  curl -fsSL https://code-server.dev/install.sh | sh > /dev/null 2>&1
  systemctl restart code-server
fi

# Re-inject APP_KEY from the persisted key file into the systemd unit
# so it's never lost after a git pull overwrites nothing (service file is
# written outside the repo, but this guards against manual resets).
APP_KEY_FILE="$INSTALL_DIR/data/.app_key"
if [ -f "\$APP_KEY_FILE" ]; then
  CURRENT_KEY=\$(cat "\$APP_KEY_FILE")
  sed -i "s|^Environment=APP_KEY=.*|Environment=APP_KEY=\$CURRENT_KEY|" /etc/systemd/system/openfinder.service
  systemctl daemon-reload
fi

systemctl restart openfinder
echo "OpenFinder updated successfully."
UPDATEEOF
chmod +x /usr/local/bin/openfinder-update

# ── Done ──────────────────────────────────────────────────────
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   OpenFinder installed successfully! 🎉      ║${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Dashboard:  ${BOLD}http://$LOCAL_IP${NC}"
if [ "$COOLIFY_ENABLED" = "true" ]; then
  echo -e "${GREEN}${BOLD}║${NC}  Coolify:    ${BOLD}http://$LOCAL_IP:$COOLIFY_APP_PORT${NC}"
fi
echo -e "${GREEN}${BOLD}║${NC}  VS Code:     ${BOLD}http://$LOCAL_IP/code/${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Samba share: ${BOLD}\\\\\\\\$LOCAL_IP\\\\OpenFinder-Storage${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Logs:        ${BOLD}journalctl -u openfinder -f${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Update:      ${BOLD}sudo openfinder-update${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${YELLOW}First boot: Open the dashboard URL to create your admin account.${NC}"
echo ""
