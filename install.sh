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
  curl git nginx samba ntfs-3g \
  util-linux sqlite3 build-essential \
  > /dev/null 2>&1

# ── 2. Node.js 20 LTS ─────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
  log "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y nodejs > /dev/null 2>&1
else
  log "Node.js $(node -v) already installed."
fi

# ── 3. App directory & clone/update ──────────────────────────
INSTALL_DIR="/opt/openfinder"
REPO_URL="https://github.com/abdlx/OpenFinder-shell.git"

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

log "Building production Next.js bundle..."
npm run build

# ── 5. Create data directories ───────────────────────────────
log "Provisioning runtime directories..."
mkdir -p \
  "$INSTALL_DIR/data/.tus_uploads" \
  /mnt/openfinder-storage   # Default isolated storage for Samba shares

chmod 755 /mnt/openfinder-storage
chmod -R 700 "$INSTALL_DIR/data"  # Protect the SQLite database from other users

# ── 6. Systemd service ───────────────────────────────────────
log "Creating systemd service (openfinder.service)..."
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

# ── 8. Nginx reverse proxy ───────────────────────────────────
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
}
NGINXEOF

# Disable the default Nginx site and enable ours
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/openfinder /etc/nginx/sites-enabled/

nginx -t && systemctl restart nginx
log "Nginx configured — proxying port 80 → Node.js :3000"

# ── 9. Auto-update script ─────────────────────────────────────
cat > /usr/local/bin/openfinder-update <<UPDATEEOF
#!/bin/bash
set -e
cd $INSTALL_DIR
git pull
npm install --legacy-peer-deps --silent
npm run build
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
echo -e "${GREEN}${BOLD}║${NC}  Samba share: ${BOLD}\\\\\\\\$LOCAL_IP\\\\OpenFinder-Storage${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Logs:        ${BOLD}journalctl -u openfinder -f${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Update:      ${BOLD}sudo openfinder-update${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${YELLOW}First boot: Open the dashboard URL to create your admin account.${NC}"
echo ""
