import type { ComponentType } from "react";
import {
  Activity,
  Boxes,
  Code,
  FileText,
  Folder,
  Globe,
  Images,
  Settings,
  Sparkles,
  Terminal,
} from "lucide-react";
import type { CapabilitiesMap } from "../hooks/useCapabilities";
import type { InstalledApp } from "../hooks/useInstalledApps";

export type LauncherApp = {
  id: string;
  label: string;
  icon: ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  color: string;
  iconUrl?: string;
  subtitle?: string;
  url?: string;
  installedId?: string;
  capability?: keyof CapabilitiesMap;
};

const BUILT_IN_APPS: LauncherApp[] = [
  {
    id: "files",
    label: "Files",
    icon: Folder,
    color: "from-[#0A84FF] to-[#0055B3]",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    color: "from-[#8E8E93] to-[#48484A]",
  },
  {
    id: "activity",
    label: "Activity",
    icon: Activity,
    color: "from-[#32ADE6] to-[#12648A]",
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: Terminal,
    color: "from-[#2C2C2E] to-[#1C1C1E]",
  },
  {
    id: "notes",
    label: "Notes",
    icon: FileText,
    color: "from-[#F59E0B] to-[#D97706]",
  },
  {
    id: "coolify",
    label: "Coolify",
    icon: Boxes,
    color: "from-[#8C52FF] to-[#5B13D5]",
    capability: "coolify",
  },
  {
    id: "immich",
    label: "Immich",
    icon: Images,
    color: "from-[#D946EF] via-[#F43F5E] to-[#F59E0B]",
    capability: "immich",
  },
  {
    id: "vscode",
    label: "Code Server",
    icon: Code,
    color: "from-[#5B21B6] to-[#2563EB]",
    iconUrl: "/api/apps/code-server/icon",
    capability: "codeServer",
  },
  {
    id: "codex",
    label: "Codex",
    icon: Sparkles,
    color: "from-[#17BE92] to-[#0A6F55]",
    capability: "codex",
  },
];
export const APP_STORE_LAUNCHER: LauncherApp = {
  id: "app-store",
  label: "App Store",
  icon: Boxes,
  color: "from-blue-500 to-violet-600",
};
export const FACTORY_DOCK_APPS = [
  "files",
  "activity",
  "terminal",
  "notes",
  "settings",
];

export function buildLauncherApps(
  installed: InstalledApp[],
  isEnabled: (id: keyof CapabilitiesMap) => boolean,
) {
  const apps = Object.fromEntries(
    BUILT_IN_APPS.filter(
      (app) => !app.capability || isEnabled(app.capability),
    ).map((app) => [app.id, app]),
  );
  for (const app of installed) {
    if (app.status === "missing") continue;
    const id = `${app.managedByHomiOS ? "managed" : "coolify"}:${app.id}`;
    apps[id] = {
      id,
      installedId: app.id,
      label: app.name,
      icon: Globe,
      color: "from-[#2563EB] to-[#7C3AED]",
      iconUrl: `/api/apps/${encodeURIComponent(app.catalogId)}/icon`,
      subtitle: `${app.resourceType === "application" ? "App" : "Service"} · ${app.status}`,
      url: ["running", "unhealthy"].includes(app.status)
        ? app.primaryUrl || undefined
        : undefined,
    };
  }
  return apps;
}

export function openLauncherUrl(app: LauncherApp) {
  if (!app.url) return false;
  try {
    const url = new URL(
      app.url.includes("://") ? app.url : `https://${app.url}`,
    );
    if (!["http:", "https:"].includes(url.protocol)) return false;
    window.open(url.href, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}
