import React, { useState, useEffect, useCallback } from "react";
import { useWallpaper } from "../hooks/useWallpaper";
import { useUsername } from "../hooks/useUsername";
import { useTheme, ThemePreference } from "../hooks/useTheme";
import {
  usePerformanceSettings,
  BackgroundPollingMode,
} from "../hooks/usePerformanceSettings";
import { confirmDialog, promptDialog, toast } from "./SystemUI";
import {
  Settings,
  Monitor,
  Users,
  Wifi,
  Info,
  CheckCircle2,
  HardDrive,
  Shield,
  Globe,
  UserPlus,
  Database,
  ShieldCheck,
  Cpu,
  Server,
  Menu,
  Key,
  Bell,
  Smartphone,
  Copy,
  Trash2,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  Send,
  Sun,
  Moon,
  Image as ImageIcon,
  Folder,
  Share2,
  Cloud,
} from "lucide-react";
import SambaPanel from "./SambaPanel";
import SettingsOverview from "../features/settings/SettingsOverview";
import {
  SettingsSection,
  SettingsRow,
} from "../features/settings/SettingsControls";
import SettingsFrame from "../features/settings/SettingsFrame";
import AppearancePanel from "../features/settings/AppearancePanel";
import {
  IdentityPanel,
  AboutPanel,
  NetworkPanel,
} from "../features/settings/DevicePanels";
import { useShellRoute } from "../hooks/useShellNavigation";
import { useSystemStats } from "../hooks/useSystemStats";
import { Button, ErrorPanel, IconButton } from "./ui/surfaces";
import { ArrowLeft, X } from "lucide-react";

interface SettingsAppProps {
  username?: string;
  onClose?: () => void;
  isActive?: boolean;
}

const PHOTOS_SOURCES_KEY = "homios_photos_sources";
const SETTINGS_TAB_IDS = new Set([
  "overview",
  "general",
  "appearance",
  "storage",
  "samba",
  "users",
  "members",
  "tokens",
  "notifications",
  "2fa",
  "network",
  "security",
  "about",
]);

export default function SettingsApp({
  onClose,
  isActive = true,
  username: initialUsername,
}: SettingsAppProps) {
  const { route, navigate } = useShellRoute();
  const activeTab =
    route.settingsTab && SETTINGS_TAB_IDS.has(route.settingsTab)
      ? route.settingsTab
      : "overview";
  const setActiveTab = (tab: string) =>
    navigate({ view: "settings", settingsTab: tab });
  const { wallpaper, changeWallpaper } = useWallpaper();
  const { username, changeUsername } = useUsername(initialUsername);
  const { theme, changeTheme } = useTheme();
  const {
    settings: performanceSettings,
    updateSettings: updatePerformanceSettings,
  } = usePerformanceSettings();
  const statsResource = useSystemStats(
    isActive,
    performanceSettings.backgroundPolling,
  );
  const sysStats = statsResource.data;
  const [users, setUsers] = useState<any[]>([]);
  const [drives, setDrives] = useState<any[]>([]);
  const [shortcuts, setShortcuts] = useState<any[]>([]);
  const [photoSources, setPhotoSources] = useState<string[]>([]);
  const [cloudSettings, setCloudSettings] = useState({
    clientId: "",
    clientSecret: "",
    redirectUri: "",
    configured: true,
    hasSecret: false,
    status: "unconfigured",
    accounts: 0,
  });
  const [cloudSaving, setCloudSaving] = useState(false);

  // Teams & Members
  const [teamInfo, setTeamInfo] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  // API Tokens
  const [tokens, setTokens] = useState<any[]>([]);
  const [newTokenName, setNewTokenName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);

  // Notifications
  const [notifSettings, setNotifSettings] = useState<any[]>([]);
  const [notifChannel, setNotifChannel] = useState("discord");
  const [notifConfig, setNotifConfig] = useState<Record<string, string>>({});

  // 2FA
  const [twoFA, setTwoFA] = useState<any>(null);
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [tfaLoading, setTfaLoading] = useState(false);

  const loadTeam = useCallback(async () => {
    const td = await fetch("/api/teams").then((r) => (r.ok ? r.json() : null));
    if (!td) return;
    setTeamInfo(td);
    const mid = td.activeTeamId;
    if (mid) {
      const ms = await fetch(`/api/teams/${mid}/members`).then((r) =>
        r.ok ? r.json() : [],
      );
      setMembers(ms);
      const ns = await fetch(`/api/teams/${mid}/notifications`).then((r) =>
        r.ok ? r.json() : [],
      );
      setNotifSettings(Array.isArray(ns) ? ns : []);
    }
  }, []);

  const loadTokens = useCallback(async () => {
    const t = await fetch("/api/tokens").then((r) => (r.ok ? r.json() : []));
    setTokens(Array.isArray(t) ? t : []);
  }, []);

  const loadTwoFA = useCallback(async () => {
    const d = await fetch("/api/auth/2fa").then((r) =>
      r.ok ? r.json() : null,
    );
    setTwoFA(d);
  }, []);

  const loadCloudSettings = useCallback(async () => {
    const value = await fetch("/api/cloud-drive/settings")
      .then(async (response) => (response.ok ? response.json() : null))
      .catch(() => null);
    if (value)
      setCloudSettings((current) => ({
        ...current,
        ...value,
        clientSecret: "",
      }));
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const controller = new AbortController();
    const get = (url: string) =>
      fetch(url, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("Settings could not be loaded");
        return response.json();
      });
    if (activeTab === "users")
      void get("/api/users")
        .then(setUsers)
        .catch(() => {});
    if (["overview", "storage"].includes(activeTab))
      void get("/api/drives/available")
        .then((data) => setDrives(Array.isArray(data) ? data : []))
        .catch(() => {});
    if (activeTab === "storage") {
      void get("/api/system/shortcuts")
        .then((data) => setShortcuts(Array.isArray(data) ? data : []))
        .catch(() => {});
      void loadCloudSettings();
    }
    if (["members", "notifications"].includes(activeTab))
      void loadTeam().catch(() => {});
    if (activeTab === "tokens") void loadTokens().catch(() => {});
    if (["overview", "2fa", "security"].includes(activeTab))
      void loadTwoFA().catch(() => {});
    return () => controller.abort();
  }, [activeTab, isActive, loadCloudSettings, loadTeam, loadTokens, loadTwoFA]);

  const saveCloudSettings = async () => {
    setCloudSaving(true);
    try {
      const response = await fetch("/api/cloud-drive/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: cloudSettings.clientId,
          clientSecret: cloudSettings.clientSecret,
        }),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(value.error || "Could not save cloud storage settings");
      setCloudSettings((current) => ({
        ...current,
        ...value,
        clientSecret: "",
        accounts: current.accounts,
      }));
      await loadCloudSettings();
      const driveData = await fetch("/api/drives/available").then((result) =>
        result.json(),
      );
      if (Array.isArray(driveData)) setDrives(driveData);
      window.dispatchEvent(new Event("homios:cloud-drive-changed"));
      toast({
        message: "Cloud storage configured",
        description: "You can now add Google accounts.",
        tone: "success",
      });
    } catch (error) {
      toast({
        message: "Cloud storage setup failed",
        description:
          error instanceof Error
            ? error.message
            : "Check the credentials and service URL.",
        tone: "danger",
      });
    } finally {
      setCloudSaving(false);
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PHOTOS_SOURCES_KEY);
      setPhotoSources(saved ? JSON.parse(saved) : []);
    } catch {
      setPhotoSources([]);
    }
  }, []);

  const savePhotoSources = (sources: string[]) => {
    const unique = Array.from(new Set(sources.filter(Boolean)));
    setPhotoSources(unique);
    if (unique.length === 0) {
      localStorage.removeItem(PHOTOS_SOURCES_KEY);
    } else {
      localStorage.setItem(PHOTOS_SOURCES_KEY, JSON.stringify(unique));
    }
    window.dispatchEvent(new Event("homios:photos-sources-changed"));
    toast({
      message:
        unique.length === 0
          ? "Photos will scan all detected sources"
          : "Photos library sources updated",
      tone: "success",
    });
  };

  const togglePhotoSource = (sourcePath: string) => {
    if (!sourcePath) return;
    if (photoSources.includes(sourcePath)) {
      savePhotoSources(photoSources.filter((source) => source !== sourcePath));
    } else {
      savePhotoSources([...photoSources, sourcePath]);
    }
  };

  const addPhotoSourcePath = async () => {
    const sourcePath = await promptDialog({
      title: "Add Photos Folder",
      placeholder: "D:\\Pictures or /mnt/media",
      confirmLabel: "Add",
    });
    if (sourcePath?.trim()) {
      savePhotoSources([...photoSources, sourcePath.trim()]);
    }
  };

  const inviteMember = async () => {
    if (!inviteEmail || !teamInfo?.activeTeamId) return;
    await fetch(`/api/teams/${teamInfo.activeTeamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    setInviteEmail("");
    loadTeam();
  };

  const createToken = async () => {
    if (!newTokenName) return;
    const r = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTokenName,
        abilities: ["read", "write", "deploy"],
      }),
    });
    if (r.ok) {
      const d = await r.json();
      setNewToken(d.token);
      setNewTokenName("");
      loadTokens();
    }
  };

  const revokeToken = async (id: string) => {
    await fetch("/api/tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadTokens();
  };

  const saveNotif = async (channel: string, enabled: boolean, config: any) => {
    if (!teamInfo?.activeTeamId) return;
    await fetch(`/api/teams/${teamInfo.activeTeamId}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, enabled, config }),
    });
    loadTeam();
  };

  const testNotif = async (channel: string) => {
    if (!teamInfo?.activeTeamId) return;
    await fetch(`/api/teams/${teamInfo.activeTeamId}/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    });
  };

  const init2FA = async () => {
    setTfaLoading(true);
    const r = await fetch("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "init" }),
    });
    const d = await r.json();
    setTwoFA((prev: any) => ({ ...prev, ...d }));
    setTfaLoading(false);
  };

  const enable2FA = async () => {
    setTfaLoading(true);
    const r = await fetch("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enable", code: totpCode }),
    });
    const d = await r.json();
    if (d.recoveryCodes) {
      setRecoveryCodes(d.recoveryCodes);
      loadTwoFA();
    }
    setTotpCode("");
    setTfaLoading(false);
  };

  const disable2FA = async () => {
    const ok = await confirmDialog({
      title: "Disable two-factor authentication?",
      message: "This will make your account less secure.",
      tone: "danger",
      confirmLabel: "Disable",
    });
    if (!ok) return;
    const pw = await promptDialog({
      title: "Confirm your password",
      placeholder: "Password",
      confirmLabel: "Confirm",
    });
    if (!pw) return;
    setTfaLoading(true);
    await fetch("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", password: pw }),
    });
    setRecoveryCodes([]);
    loadTwoFA();
    setTfaLoading(false);
  };

  const NOTIF_CHANNELS = [
    {
      id: "email",
      label: "Email",
      fields: [
        { key: "host", label: "SMTP Host" },
        { key: "port", label: "Port" },
        { key: "user", label: "Username" },
        { key: "pass", label: "Password", type: "password" },
        { key: "from", label: "From Address" },
      ],
    },
    {
      id: "discord",
      label: "Discord",
      fields: [{ key: "webhookUrl", label: "Webhook URL" }],
    },
    {
      id: "slack",
      label: "Slack",
      fields: [{ key: "webhookUrl", label: "Webhook URL" }],
    },
    {
      id: "telegram",
      label: "Telegram",
      fields: [
        { key: "botToken", label: "Bot Token" },
        { key: "chatId", label: "Chat ID" },
      ],
    },
    {
      id: "pushover",
      label: "Pushover",
      fields: [
        { key: "userKey", label: "User Key" },
        { key: "appToken", label: "App Token" },
      ],
    },
    {
      id: "webhook",
      label: "Custom Webhook",
      fields: [{ key: "url", label: "URL" }],
    },
  ];

  return (
    <SettingsFrame
      tab={activeTab}
      onBack={() => setActiveTab("overview")}
      onClose={onClose}
    >
      {statsResource.error && (
        <div className="mb-5">
          <ErrorPanel
            message={statsResource.error}
            onRetry={() => void statsResource.refresh()}
          />
        </div>
      )}
      {activeTab === "overview" && (
        <SettingsOverview
          username={username}
          wallpaper={wallpaper}
          stats={sysStats}
          drives={drives}
          twoFA={twoFA}
          onNavigate={setActiveTab}
        />
      )}

      {activeTab === "general" && (
        <IdentityPanel
          username={username}
          onChange={changeUsername}
          stats={sysStats}
        />
      )}

      {activeTab === "appearance" && (
        <AppearancePanel
          theme={theme}
          changeTheme={changeTheme}
          wallpaper={wallpaper}
          changeWallpaper={changeWallpaper}
          performance={performanceSettings}
          updatePerformance={updatePerformanceSettings}
        />
      )}

      {/* USERS & GROUPS TAB */}
      {activeTab === "users" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-[#1f1f22] rounded-3xl p-6 shadow-sm border border-neutral-200/50 dark:border-white/10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500">
                  <Users size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                    System Users
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Manage accounts and permissions
                  </p>
                </div>
              </div>
              <button className="flex items-center space-x-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium">
                <UserPlus size={16} />
                <span>Add User</span>
              </button>
            </div>

            <div className="space-y-3">
              {users.map((user: any) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <div className="flex items-center space-x-4">
                    <img
                      src={`https://ui-avatars.com/api/?name=${user.email}&background=0D8ABC&color=fff`}
                      className="w-10 h-10 rounded-full"
                      alt={user.email}
                    />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {user.email.split("@")[0]}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {user.email} • Admin
                      </p>
                    </div>
                  </div>
                  <span className="bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-sm font-bold px-2.5 py-1 rounded-full">
                    Active
                  </span>
                </div>
              ))}
              {users.length === 0 && (
                <div className="p-4 text-center text-slate-500 text-sm">
                  Loading users...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "network" && <NetworkPanel stats={sysStats} />}

      {/* STORAGE TAB */}
      {activeTab === "storage" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-[#1f1f22] rounded-3xl p-6 shadow-sm border border-neutral-200/50 dark:border-white/10">
            <div className="flex items-center space-x-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
                <Database size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  Storage & Volumes
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Disks, mounts, and quotas
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center">
                    <HardDrive
                      size={16}
                      className="mr-2 text-slate-400 dark:text-slate-500"
                    />{" "}
                    System Volume (/)
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {sysStats
                      ? `${(sysStats.disk.used / 1024 ** 3).toFixed(1)} GB / ${(sysStats.disk.total / 1024 ** 3).toFixed(1)} GB (${((sysStats.disk.used / sysStats.disk.total) * 100).toFixed(1)}% used)`
                      : "Loading..."}
                  </span>
                </div>
                <div className="w-full h-4 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden border border-black/5 dark:border-white/5">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-1000"
                    style={{
                      width: sysStats
                        ? `${(sysStats.disk.used / sysStats.disk.total) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Mount: /
                </p>
              </div>

              <div
                id="cloud-account-pool"
                className="border-t border-slate-100 dark:border-white/10 pt-6 scroll-mt-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center">
                      <Cloud size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800 dark:text-white">
                        Cloud Account Pool
                      </h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Add Google OAuth credentials for HomiOS's built-in
                        pooled cloud drive.
                      </p>
                    </div>
                  </div>
                  <span
                    className={`self-start px-2.5 py-1 rounded-full text-sm font-semibold ${cloudSettings.status === "ready" ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : cloudSettings.status === "unavailable" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"}`}
                  >
                    {cloudSettings.status === "ready"
                      ? `${cloudSettings.accounts} account${cloudSettings.accounts === 1 ? "" : "s"} pooled`
                      : cloudSettings.status === "unavailable"
                        ? "Service unavailable"
                        : "Setup required"}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Google OAuth Client ID
                    </span>
                    <input
                      value={cloudSettings.clientId}
                      onChange={(event) =>
                        setCloudSettings({
                          ...cloudSettings,
                          clientId: event.target.value,
                        })
                      }
                      placeholder="…apps.googleusercontent.com"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Google OAuth Client Secret
                    </span>
                    <input
                      type="password"
                      value={cloudSettings.clientSecret}
                      onChange={(event) =>
                        setCloudSettings({
                          ...cloudSettings,
                          clientSecret: event.target.value,
                        })
                      }
                      placeholder={
                        cloudSettings.hasSecret
                          ? "Saved — leave blank to keep"
                          : "Google OAuth client secret"
                      }
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Authorized redirect URI
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 font-mono break-all">
                    {cloudSettings.redirectUri ||
                      `${typeof window !== "undefined" ? window.location.origin : ""}/api/cloud-drive/oauth-callback`}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Add this exact URI to the Google Cloud OAuth client.
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={saveCloudSettings}
                    disabled={cloudSaving}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {cloudSaving ? "Saving…" : "Save & Validate"}
                  </button>
                  <button
                    onClick={() => {
                      window.location.href = "/api/cloud-drive/connect";
                    }}
                    disabled={cloudSettings.status !== "ready"}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/20 disabled:opacity-50 transition-colors"
                  >
                    Add Google Account
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-white/10 pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-pink-50 dark:bg-pink-500/10 text-pink-500 flex items-center justify-center">
                      <ImageIcon size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800 dark:text-white">
                        Photos Library Sources
                      </h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Choose drives and folders scanned by the Photos app.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => savePhotoSources([])}
                    className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                  >
                    Scan All
                  </button>
                  <button
                    onClick={addPhotoSourcePath}
                    className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Add Folder Path
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/10 flex items-center gap-2">
                      <HardDrive size={16} className="text-slate-400" />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Drives
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-white/10">
                      {drives.map((drive) => {
                        const sourcePath = drive.path || "";
                        const checked =
                          photoSources.length === 0 ||
                          photoSources.includes(sourcePath);
                        return (
                          <label
                            key={drive.path || drive.label}
                            className={`flex items-center gap-3 px-4 py-3 text-sm ${sourcePath ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" : "opacity-50"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!sourcePath}
                              onChange={() => togglePhotoSource(sourcePath)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-700 dark:text-slate-200 truncate">
                                {drive.label || sourcePath}
                              </p>
                              <p className="text-sm text-slate-400 dark:text-slate-500 truncate">
                                {sourcePath || "Unmounted"}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                      {drives.length === 0 && (
                        <p className="px-4 py-4 text-sm text-slate-400">
                          No drives detected.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/10 flex items-center gap-2">
                      <Folder size={16} className="text-slate-400" />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Folders
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-white/10 max-h-72 overflow-y-auto">
                      {shortcuts.map((shortcut) => {
                        const sourcePath = shortcut.path || "";
                        const checked =
                          photoSources.length === 0 ||
                          photoSources.includes(sourcePath);
                        return (
                          <label
                            key={shortcut.path || shortcut.label}
                            className="flex items-center gap-3 px-4 py-3 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePhotoSource(sourcePath)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-700 dark:text-slate-200 truncate">
                                {shortcut.label || sourcePath}
                              </p>
                              <p className="text-sm text-slate-400 dark:text-slate-500 truncate">
                                {sourcePath}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                      {shortcuts.length === 0 && (
                        <p className="px-4 py-4 text-sm text-slate-400">
                          No common media folders detected.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
                  {photoSources.length === 0
                    ? "Photos is currently scanning every detected source."
                    : `Photos is scanning ${photoSources.length} selected source${photoSources.length === 1 ? "" : "s"}.`}
                </p>
                {photoSources.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/10 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Active Sources
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-white/10">
                      {photoSources.map((source) => (
                        <div
                          key={source}
                          className="flex items-center gap-3 px-4 py-3"
                        >
                          <span className="flex-1 min-w-0 text-sm text-slate-600 dark:text-slate-300 truncate">
                            {source}
                          </span>
                          <button
                            onClick={() =>
                              savePhotoSources(
                                photoSources.filter((item) => item !== source),
                              )
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            title="Remove source"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SAMBA SHARING TAB */}
      {activeTab === "samba" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-[#1f1f22] rounded-3xl p-6 shadow-sm border border-neutral-200/50 dark:border-white/10">
            <SambaPanel />
          </div>
        </div>
      )}

      {activeTab === "security" && (
        <SettingsSection
          title="Account protection"
          description="Control who can reach your HomiOS and what they can do."
        >
          <SettingsRow
            label="Two-factor authentication"
            description={
              twoFA
                ? twoFA.enabled
                  ? "An additional sign-in check is enabled."
                  : "Protect your account with an authenticator."
                : "Reading account security..."
            }
          >
            <Button onClick={() => setActiveTab("2fa")}>
              {twoFA?.enabled ? "Manage protection" : "Set up protection"}
            </Button>
          </SettingsRow>
          <SettingsRow
            label="API access"
            description="Review and revoke credentials used by integrations."
          >
            <Button onClick={() => setActiveTab("tokens")}>
              Manage tokens
            </Button>
          </SettingsRow>
          <SettingsRow
            label="People & permissions"
            description="Manage team members and their roles."
          >
            <Button onClick={() => setActiveTab("members")}>
              Manage members
            </Button>
          </SettingsRow>
          <SettingsRow
            label="Host security"
            description="SSH, firewall rules, and operating-system updates are managed on your server."
          >
            <Button onClick={() => navigate({ view: "terminal" })}>
              Open Terminal
            </Button>
          </SettingsRow>
        </SettingsSection>
      )}

      {/* TEAM MEMBERS TAB */}
      {activeTab === "members" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-[#1f1f22] rounded-3xl p-6 shadow-sm border border-neutral-200/50 dark:border-white/10">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500">
                <UserPlus size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  Team Members
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {teamInfo?.teams?.find(
                    (t: any) => t.id === teamInfo.activeTeamId,
                  )?.name || "Personal Team"}
                </p>
              </div>
            </div>
            <div className="flex gap-3 mb-6">
              <input
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 border border-slate-200 dark:border-white/10 dark:bg-white/5 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-500"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="border border-slate-200 dark:border-white/10 dark:bg-[#1f1f22] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-500"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
              <button
                onClick={inviteMember}
                className="bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-600 transition"
              >
                Invite
              </button>
            </div>
            <div className="space-y-2">
              {members.map((m: any) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-2xl"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={`https://ui-avatars.com/api/?name=${m.email}&background=6366f1&color=fff&size=32`}
                      className="w-8 h-8 rounded-full"
                      alt=""
                    />
                    <span className="text-sm font-medium dark:text-slate-200">
                      {m.email}
                    </span>
                  </div>
                  <span
                    className={`text-sm px-2 py-0.5 rounded-full font-semibold ${m.role === "owner" ? "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300" : m.role === "admin" ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300" : "bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300"}`}
                  >
                    {m.role}
                  </span>
                </div>
              ))}
              {members.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">
                  No members yet
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* API TOKENS TAB */}
      {activeTab === "tokens" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-[#1f1f22] rounded-3xl p-6 shadow-sm border border-neutral-200/50 dark:border-white/10">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
                <Key size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  API Tokens
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Tokens for programmatic access to the API
                </p>
              </div>
            </div>
            {newToken && (
              <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <p className="text-sm font-semibold text-emerald-700 mb-2">
                  Copy your token now — it won't be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-white border border-emerald-200 rounded-lg px-3 py-2 font-mono break-all">
                    {newToken}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newToken);
                      toast({
                        message: "Token copied to clipboard",
                        tone: "success",
                      });
                    }}
                    className="text-emerald-600 hover:text-emerald-800"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <button
                  onClick={() => setNewToken(null)}
                  className="mt-2 text-sm text-emerald-600 underline"
                >
                  Dismiss
                </button>
              </div>
            )}
            <div className="flex gap-3 mb-6">
              <input
                placeholder="Token name"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                className="flex-1 border border-slate-200 dark:border-white/10 dark:bg-white/5 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500"
              />
              <button
                onClick={createToken}
                className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-600 transition flex items-center gap-2"
              >
                <Plus size={15} /> Create
              </button>
            </div>
            <div className="space-y-2">
              {tokens.map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-2xl"
                >
                  <div>
                    <p className="text-sm font-medium dark:text-slate-200">
                      {t.name}
                    </p>
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {t.abilities} • Created{" "}
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => revokeToken(t.id)}
                    className="text-red-400 hover:text-red-600 dark:hover:text-red-400 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {tokens.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">
                  No tokens yet
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS TAB */}
      {activeTab === "notifications" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-[#1f1f22] rounded-3xl p-6 shadow-sm border border-neutral-200/50 dark:border-white/10">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500">
                <Bell size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  Notification Channels
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Get alerted on deployments, failures, and health
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap mb-6">
              {NOTIF_CHANNELS.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => {
                    setNotifChannel(ch.id);
                    const s = notifSettings.find(
                      (n: any) => n.channel === ch.id,
                    );
                    setNotifConfig(s ? JSON.parse(s.config || "{}") : {});
                  }}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${notifChannel === ch.id ? "bg-rose-500 text-white" : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10"}`}
                >
                  {ch.label}
                </button>
              ))}
            </div>
            {(() => {
              const ch = NOTIF_CHANNELS.find((c) => c.id === notifChannel)!;
              const setting = notifSettings.find(
                (n: any) => n.channel === notifChannel,
              );
              const enabled = setting?.enabled ?? false;
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Enable {ch.label}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!enabled}
                        onChange={(e) =>
                          saveNotif(notifChannel, e.target.checked, notifConfig)
                        }
                      />
                      <div className="w-11 h-6 bg-slate-200 dark:bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
                    </label>
                  </div>
                  {ch.fields.map((f) => (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-slate-500 mb-1">
                        {f.label}
                      </label>
                      <input
                        type={(f as any).type || "text"}
                        value={notifConfig[f.key] || ""}
                        onChange={(e) =>
                          setNotifConfig((c) => ({
                            ...c,
                            [f.key]: e.target.value,
                          }))
                        }
                        className="w-full border border-slate-200 dark:border-white/10 dark:bg-white/5 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 dark:focus:ring-rose-500"
                      />
                    </div>
                  ))}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() =>
                        saveNotif(notifChannel, !!enabled, notifConfig)
                      }
                      className="flex-1 bg-rose-500 text-white rounded-xl py-2 text-sm font-medium hover:bg-rose-600 transition"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => testNotif(notifChannel)}
                      className="flex items-center gap-2 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 rounded-xl px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 transition"
                    >
                      <Send size={14} /> Test
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 2FA TAB */}
      {activeTab === "2fa" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-[#1f1f22] rounded-3xl p-6 shadow-sm border border-neutral-200/50 dark:border-white/10">
            <div className="flex items-center gap-4 mb-6">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${twoFA?.enabled ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-500" : "bg-slate-100 dark:bg-white/10 text-slate-400 dark:text-slate-500"}`}
              >
                <Smartphone size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  Two-Factor Authentication
                </h3>
                <p
                  className={`text-sm font-medium ${twoFA?.enabled ? "text-emerald-600" : "text-slate-500"}`}
                >
                  {twoFA?.enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
            </div>

            {twoFA?.enabled ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Your account is protected with TOTP two-factor authentication.
                </p>
                {recoveryCodes.length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <p className="text-sm font-semibold text-amber-700 mb-3">
                      Save these recovery codes in a safe place.
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {recoveryCodes.map((c, i) => (
                        <code
                          key={i}
                          className="bg-white/50 border border-amber-200/50 rounded px-2 py-1 text-sm font-mono text-amber-800"
                        >
                          {c}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={disable2FA}
                  disabled={tfaLoading}
                  className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 px-5 py-2 rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-500/20 transition"
                >
                  Disable 2FA
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Add an extra layer of security using an authenticator app like
                  Google Authenticator or 1Password.
                </p>
                {!twoFA?.qrDataUrl && (
                  <button
                    onClick={init2FA}
                    disabled={tfaLoading}
                    className="bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600 transition disabled:opacity-60"
                  >
                    {tfaLoading ? "Generating…" : "Set up 2FA"}
                  </button>
                )}
                {twoFA?.qrDataUrl && (
                  <div className="space-y-5">
                    <div className="flex flex-col items-center gap-3">
                      <img
                        src={twoFA.qrDataUrl}
                        className="w-40 h-40 rounded-2xl border border-slate-200 shadow-sm"
                        alt="QR code"
                      />
                      <p className="text-sm text-slate-400 text-center">
                        Scan with your authenticator app
                        <br />
                        or enter the secret manually:
                      </p>
                      <code className="text-sm bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-lg font-mono break-all">
                        {twoFA.secret}
                      </code>
                    </div>
                    <div className="flex gap-3">
                      <input
                        placeholder="6-digit code"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        maxLength={6}
                        className="flex-1 border border-slate-200 dark:border-white/10 dark:bg-white/5 rounded-xl px-3 py-2 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500"
                      />
                      <button
                        onClick={enable2FA}
                        disabled={tfaLoading || totpCode.length < 6}
                        className="bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-600 transition disabled:opacity-50"
                      >
                        {tfaLoading ? "Verifying…" : "Enable"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "about" && <AboutPanel stats={sysStats} />}
    </SettingsFrame>
  );
}
