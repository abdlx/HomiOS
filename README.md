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

### Quick Install (Recommended)

The easiest way to install OpenFinder on a fresh Ubuntu/Debian server is using our automated installation script. This script automatically handles Node.js setup, Nginx reverse proxying, systemd service creation, and Samba configurations.

Run this command as your primary user (or root):

```bash
curl -fsSL https://raw.githubusercontent.com/abdlx/OpenFinder-shell/main/install.sh | sudo bash
```

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

## 🛠️ Tech Stack

- **Framework:** Next.js & React
- **Styling:** Tailwind CSS & Lucide Icons
- **Backend:** Node.js API Routes & Better-SQLite3
- **System Integration:** Direct execution of core Linux utilities (`bash`, `smbpasswd`, `useradd`, etc.)

---

## 📝 License

OpenFinder is open-source software licensed under the MIT license.
