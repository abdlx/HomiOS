# OpenFinder OS

<div align="center">
  <p><strong>A hyper-premium, Apple-inspired Web GUI for your Linux Server.</strong></p>
</div>

OpenFinder is a drop-in web dashboard and file manager that brings a beautiful, desktop-class experience to any headless Linux machine. It installs directly on top of your existing bare-metal Linux OS (like Ubuntu or Debian), allowing you to manage files, create authenticated network drives, and execute terminal commands—all from a stunning web interface.

---

## 🌟 Why OpenFinder?

We compared OpenFinder against the leading home server dashboards:

| Feature | CasaOS | Umbrel | ZimaOS | OpenFinder |
| :--- | :---: | :---: | :---: | :---: |
| **Installs on existing Linux** | ✅ | ✅ | ❌ | ✅ |
| **Premium UI** | ❌ | ✅ | ✅ | ✅ |
| **Samba user auth (UI)** | ❌ | ❌ | ✅ | ✅ |
| **File manager** | ✅ | ✅ | ✅ | ✅ |
| **Browser terminal** | ✅ | ✅ | ✅ | ✅ |

*OpenFinder is the only solution that gives you granular Samba user authentication and a truly premium interface while still allowing you to keep your existing Linux installation completely intact.*

---

## ✨ Features

- 🍏 **Apple-Inspired Design:** Fluid animations, glassmorphism, responsive grid/list views, and a meticulously crafted UI.
- 📁 **Advanced File Management:** Drag-and-drop operations, context menus, tags, favorites, and detailed file properties.
- 🌐 **Samba Share Management:** A dedicated dashboard to create network shares, toggle read-only access, and explicitly manage individual Samba user credentials right from the UI.
- 👁️ **QuickLook Previews:** Spacebar-to-preview functionality supporting images, videos, markdown, JSON, and syntax-highlighted code.
- 💻 **Browser Terminal:** Full system-level command execution with a beautiful built-in web terminal wrapper.
- 💽 **Storage & Mounts:** Monitor system storage, RAM usage, and manage mounted physical drives effortlessly.
- 📱 **Mobile Ready:** A fully responsive mobile layout with iOS-style bottom navigation.

---

## 🚀 Getting Started

### Prerequisites
- A Linux host (Ubuntu, Debian, Alpine, etc.)
- Node.js (v18+)
- Samba (Optional, if you wish to use the network sharing features: `sudo apt install samba`)

### Quick Install — Default (no Coolify)

The simplest install: OpenFinder only, no Coolify, no Codex UI.

```bash
curl -fsSL https://raw.githubusercontent.com/abdlx/OpenFinder-shell/main/install.sh | \
sudo bash -s -- --without-coolify --non-interactive
```

> **Note:** `--without-coolify` does **not** stop or uninstall Coolify if it is already installed on your server. It only disables OpenFinder's Coolify integration.

---

### OpenFinder-Managed Coolify

OpenFinder installs and manages the full Coolify lifecycle (install, start, update):

```bash
curl -fsSL https://raw.githubusercontent.com/abdlx/OpenFinder-shell/main/install.sh | \
sudo bash -s -- --with-coolify --non-interactive
```

> OpenFinder will only do this on a fresh server with no existing Coolify installation. If Coolify is already running, the installer will refuse and ask you to use `--existing-coolify` instead.

---

### Existing (External) Coolify

Use this if Coolify is **already installed and running** on your server. OpenFinder will integrate with it without touching its lifecycle, configuration, or host proxy:

```bash
curl -fsSL https://raw.githubusercontent.com/abdlx/OpenFinder-shell/main/install.sh | \
sudo bash -s -- --existing-coolify --non-interactive
```

- Coolify is **not** started, stopped, restarted, or reconfigured.
- `/data/coolify` is **not** modified.
- Host ports 80/443 remain under Coolify's proxy ownership.
- Host Nginx is **not** installed or reconfigured.
- OpenFinder will be available on port 3000 — route it through Coolify's proxy manually.

---

### Existing Coolify + Codex UI

```bash
curl -fsSL https://raw.githubusercontent.com/abdlx/OpenFinder-shell/main/install.sh | \
sudo bash -s -- --existing-coolify --with-codex-ui --non-interactive
```

---

### Codex UI (opt-in)

Codex Web UI is **not installed by default**. Add `--with-codex-ui` to any install command to enable it:

```bash
curl -fsSL https://raw.githubusercontent.com/abdlx/OpenFinder-shell/main/install.sh | \
sudo bash -s -- --without-coolify --with-codex-ui --non-interactive
```

---

### Immich Photo Library

Immich is an optional, independently managed service:

```bash
curl -fsSL https://raw.githubusercontent.com/abdlx/OpenFinder-shell/main/install.sh | \
sudo bash -s -- --with-immich --non-interactive
```

Immich stores its library and PostgreSQL data under `/data/immich` by default
and appears as a native OpenFinder desktop/mobile app at `/immich`.

---

### Changing Optional Services After Installation

All choices persist across upgrades. Change them later without deleting service data:

```bash
# Enable Coolify management (only if no Coolify exists yet)
sudo openfinder-update --with-coolify

# Switch to external Coolify integration
sudo openfinder-update --existing-coolify

# Disable Coolify integration (does NOT stop Coolify)
sudo openfinder-update --without-coolify

# Enable Codex UI
sudo openfinder-update --with-codex-ui

# Immich
sudo openfinder-update --with-immich
sudo openfinder-update --without-immich
```

---

### CLI Reference

| Flag | Effect |
| :--- | :--- |
| `--with-coolify` | OpenFinder installs & manages Coolify (fresh servers only) |
| `--existing-coolify` | Read-only integration with a running Coolify; no lifecycle ops |
| `--without-coolify` | Disable integration; does NOT stop existing Coolify |
| `--with-codex-ui` | Install Codex Web UI (opt-in) |
| `--with-immich` | Enable Immich photo library |
| `--without-immich` | Disable Immich |
| `--non-interactive` | Skip all prompts (required for piped installs) |

`--with-coolify`, `--existing-coolify`, and `--without-coolify` are mutually exclusive.

---

#### Use an OpenFinder-mounted drive as an Immich external library

If the drive is mounted correctly and its media is stored inside the `IMMICH`
folder, mount that folder specifically rather than exposing the whole drive to
Immich.

Edit the Immich Compose file:

```bash
sudo nano /data/immich/docker-compose.yml
```

Inside the existing `immich-server` service's `volumes` list, add:

```yaml
- /mnt/openfinder-storage/sda1/IMMICH:/external/sda1:ro
```

The relevant Compose configuration should resemble:

```yaml
services:
  immich-server:
    volumes:
      - ${UPLOAD_LOCATION}:/data
      - /etc/localtime:/etc/localtime:ro
      - /mnt/openfinder-storage/sda1/IMMICH:/external/sda1:ro
```

Validate the resolved configuration:

```bash
sudo docker compose \
  --env-file /data/immich/.env \
  -f /data/immich/docker-compose.yml \
  config | grep -A5 -B5 '/external/sda1'
```

Then recreate the Immich Server container:

```bash
sudo docker compose \
  --env-file /data/immich/.env \
  -f /data/immich/docker-compose.yml \
  up -d --force-recreate immich-server
```

Verify that Immich can read the mounted folder:

```bash
sudo docker exec immich_server ls -la /external/sda1
```

Once verification succeeds, open **Immich → Administration → External
Libraries**, create or select a library, add `/external/sda1` as its import
path, and scan the library. The `:ro` suffix keeps the source media read-only
inside Immich.

Once the script finishes, your dashboard will be instantly available at `http://<your-server-ip>`.

---

### Manual Installation (Advanced)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/abdlx/OpenFinder-shell.git
   cd OpenFinder-shell
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Copy the example environment file and set your credentials.
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to set your desired `ADMIN_USER` and `ADMIN_PASS`.

4. **Run the server:**
   ```bash
   # Development mode
   npm run dev

   # Production build
   npm run build
   npm run start
   ```

5. **Access the Dashboard:**
   Open your browser and navigate to `http://<your-server-ip>:3000`. Log in using the credentials you set in the `.env` file.

---

## 🔧 Troubleshooting Coolify

### "Server OS type is not supported" on Linux Mint, Pop!_OS, or Zorin OS
While the OpenFinder auto-installer fully supports these Ubuntu-based distributions, Coolify's web UI (when validating the "Localhost" server) strictly checks for `ubuntu` or `debian` in your system's `/etc/os-release` file and will throw an error if it sees `linuxmint`, `pop`, or `zorin`.

**The Fix:** Temporarily spoof your OS to Ubuntu just for the validation step:

1. Connect to your server terminal and backup your current OS release file:
   ```bash
   sudo cp /etc/os-release /etc/os-release.bak
   ```
2. Change the ID to Ubuntu:
   ```bash
   sudo sed -i 's/^ID=.*/ID=ubuntu/' /etc/os-release
   ```
3. Go back to the Coolify Dashboard and click **Validate & Save**. It should now succeed.
4. Restore your original OS file so your system updates don't break:
   ```bash
   sudo mv /etc/os-release.bak /etc/os-release
   ```

### External Coolify: "OpenFinder port 3000 not reachable from Coolify proxy"

When using `--existing-coolify`, OpenFinder runs on port 3000 on the host and listens on `0.0.0.0`.

Do not use `localhost:3000` as the Coolify proxy target because localhost inside the Coolify proxy container refers to that container.

Use an address through which the Coolify proxy can reach the OpenFinder host, for example the server LAN IP such as:
`http://<SERVER_LAN_IP>:3000`

or an appropriate Docker host-gateway/network configuration.

---

## 🛠️ Tech Stack

- **Framework:** Next.js & React
- **Styling:** Tailwind CSS & Lucide Icons
- **Backend:** Node.js API Routes & Better-SQLite3
- **System Integration:** Direct execution of core Linux utilities (`bash`, `smbpasswd`, `useradd`, etc.)

---

## 📝 License

OpenFinder is open-source software licensed under the MIT license.
