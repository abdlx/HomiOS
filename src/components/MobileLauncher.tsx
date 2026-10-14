import React, { useState } from "react";
import { motion } from "motion/react";
import { Download } from "lucide-react";
import PWAInstallChooser from "./PWAInstallChooser";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { useLauncherApps } from "../hooks/useLauncherApps";
import { useLauncherLayout } from "../hooks/useLauncherLayout";
import { usePerformanceSettings } from "../hooks/usePerformanceSettings";
import { useShellRoute } from "../hooks/useShellNavigation";
import { useUsername } from "../hooks/useUsername";
import { useVirtualRows } from "../hooks/useVirtualRows";
import {
  APP_STORE_LAUNCHER,
  openLauncherUrl,
  type LauncherApp,
} from "../lib/launcher-apps";
import { AppIcon as HomiAppIcon } from "./icons/AppIcons";

function AppButton({
  app,
  onClick,
  compact = false,
  reduceMotion,
}: {
  app: LauncherApp;
  onClick: () => void;
  compact?: boolean;
  reduceMotion: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const size = compact ? "h-[50px] w-[50px]" : "desktop-app-artwork";
  return (
    <motion.button
      type="button"
      aria-label={`Open ${app.label}`}
      title={app.subtitle || app.label}
      className={`${compact ? "w-16 shrink-0" : "h-32 w-full"} flex flex-col items-center justify-center gap-2 rounded-2xl text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white`}
      onClick={onClick}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.14 }}
    >
      {app.iconUrl && !imageFailed ? (
        <span
          className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-[23%] bg-white p-1 shadow-md`}
        >
          <img
            src={app.iconUrl}
            alt=""
            draggable={false}
            className="h-full w-full object-contain"
            onError={() => setImageFailed(true)}
          />
        </span>
      ) : (
        <HomiAppIcon
          id={app.id}
          colorClass={app.color}
          className={`${size} shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,0.3)]`}
        />
      )}
      <span className="max-w-full truncate px-1 text-[13px] font-medium leading-4 tracking-tight text-white/95 drop-shadow-sm">
        {app.label}
      </span>
    </motion.button>
  );
}

export default function MobileLauncher({
  isActive = true,
  username: initialUsername,
  wallpaper,
}: {
  isActive?: boolean;
  username?: string;
  wallpaper?: string;
}) {
  const available = useLauncherApps(isActive);
  const { gridAppIds, dockAppIds } = useLauncherLayout(available);
  const apps = [...gridAppIds.map((id) => available[id]), APP_STORE_LAUNCHER];
  const rows = useVirtualRows(apps.length, 136, 128);
  const { settings } = usePerformanceSettings();
  const { username } = useUsername(initialUsername);
  const { navigate } = useShellRoute();
  const { canInstall, openChooser, isStandalone } = usePWAInstall();
  function open(app: LauncherApp) {
    if (app.installedId) {
      if (!openLauncherUrl(app)) {
        if (app.id.startsWith("coolify:")) navigate({ view: "coolify" });
        else navigate({ view: "app-store", storeApp: app.installedId });
      }
    } else navigate({ view: app.id });
  }
  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      aria-label="Home launcher"
      style={{
        backgroundImage: wallpaper ? `url('${wallpaper}')` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        paddingTop: "max(env(safe-area-inset-top), 24px)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-black/5 to-black/30" />
      <header className="relative shrink-0 px-6 pb-4">
        <p className="text-sm font-medium text-white/70">Your home server</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight text-white">
          {username}
        </h1>
        {!isStandalone && canInstall && (
          <button
            type="button"
            onClick={openChooser}
            className="mt-3 flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/15 px-4 text-xs font-medium text-white"
          >
            <Download size={14} />
            Install HomiOS
          </button>
        )}
      </header>
      <div
        ref={rows.ref}
        aria-label="Home apps"
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain px-4"
      >
        <div style={{ position: "relative", height: rows.totalHeight }}>
          <div
            className="grid"
            style={{
              position: "absolute",
              top: rows.offset,
              left: 0,
              right: 0,
              gridTemplateColumns: `repeat(${rows.columns}, minmax(0, 1fr))`,
            }}
          >
            {apps.slice(rows.start, rows.end).map((app) => (
              <AppButton
                key={app.id}
                app={app}
                onClick={() => open(app)}
                reduceMotion={settings.reduceMotion}
              />
            ))}
          </div>
        </div>
      </div>
      <nav
        aria-label="Dock apps"
        className="relative shrink-0 px-4 pt-3"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
      >
        <div
          className={`flex items-center gap-1 overflow-x-auto rounded-[28px] border border-white/20 px-2 py-3 shadow-lg ${settings.glassSurfaces ? "bg-white/15 backdrop-blur-2xl" : "bg-neutral-900/95"}`}
        >
          {dockAppIds.map((id) => (
            <AppButton
              key={id}
              app={available[id]}
              onClick={() => open(available[id])}
              compact
              reduceMotion={settings.reduceMotion}
            />
          ))}
        </div>
      </nav>
      <PWAInstallChooser />
    </div>
  );
}
