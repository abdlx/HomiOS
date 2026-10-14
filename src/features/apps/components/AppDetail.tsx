import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Globe2,
  HardDrive,
  Play,
  RotateCw,
  Server,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import type { AppActionState, CatalogApp, StorageMount } from "../types";
import type { InstalledApp } from "../../../hooks/useInstalledApps";
import { getInstallJobState, isActiveInstallJob } from "../state";
import { Button, ErrorPanel } from "../../../components/ui/surfaces";
import { AppIcon, StatusBadge } from "./visuals";
import StorageMountSelector from "./StorageMountSelector";

export default function AppDetail({
  app,
  installed,
  job,
  state,
  storageAware,
  mounts,
  mountsLoading,
  mountsError,
  installBusy,
  installError,
  available,
  onInstall,
  onAction,
  onLogs,
  onDomains,
  onStorage,
  onRetryMounts,
}: {
  app: CatalogApp;
  installed?: InstalledApp;
  job?: any;
  state?: AppActionState;
  storageAware: boolean;
  mounts: StorageMount[];
  mountsLoading: boolean;
  mountsError?: string;
  installBusy: boolean;
  installError?: string;
  available: boolean;
  onInstall: (mountIds: string[], accessAll: boolean) => void;
  onAction: (action: string) => void;
  onLogs: () => void;
  onDomains: () => void;
  onStorage: (enabled: boolean) => void;
  onRetryMounts: () => void;
}) {
  const [selectedMounts, setSelectedMounts] = useState<string[]>([]);
  const [accessAll, setAccessAll] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (!mountsLoading && !mountsError && !initialized.current) {
      initialized.current = true;
      setSelectedMounts(
        mounts.filter((mount) => !mount.readOnly).map((mount) => mount.id),
      );
    }
  }, [mounts, mountsLoading, mountsError]);
  const displayState =
    state?.state || installed?.status || getInstallJobState(job);
  const activeInstall = isActiveInstallJob(job);
  const managed = installed?.managedByHomiOS !== false;
  const busy =
    !!state?.pending ||
    ["starting", "stopping", "restarting", "redeploying", "deploying"].includes(
      displayState || "",
    );
  const needsMount =
    app.storage.some((requirement) => requirement.required) && storageAware;
  const validMounts = selectedMounts.filter((id) =>
    mounts.some((mount) => mount.id === id && !mount.readOnly),
  );
  const installDisabled =
    !available ||
    activeInstall ||
    installBusy ||
    (needsMount && (mountsLoading || !!mountsError || !validMounts.length));
  return (
    <article className="ui-enter mx-auto w-full max-w-5xl overflow-auto px-4 pb-12 pt-5 md:px-8">
      <header className="flex flex-wrap items-center gap-5 border-b border-neutral-200/60 pb-7 dark:border-white/10">
        <AppIcon id={app.id} name={app.name} large />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-sm text-neutral-400">{app.category}</p>
          <h1 className="break-words text-2xl font-semibold tracking-tight md:text-3xl">
            {app.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {app.verified && (
              <span className="flex items-center gap-1 text-xs text-blue-500">
                <ShieldCheck size={14} />
                HomiOS verified
              </span>
            )}
            {displayState && <StatusBadge state={displayState} />}
          </div>
        </div>
        {installed?.primaryUrl && (
          <Button
            variant="primary"
            disabled={!["running", "unhealthy"].includes(installed.status)}
            onClick={() =>
              window.open(
                installed.primaryUrl!,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            <ExternalLink size={16} />
            Open app
          </Button>
        )}
      </header>
      <div className="grid gap-8 pt-7 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0 space-y-7">
          <div>
            <h2 className="mb-3 text-sm font-semibold">About this app</h2>
            <p className="whitespace-pre-line text-sm leading-7 text-neutral-500">
              {app.description}
            </p>
          </div>
          {!!app.screenshots?.length && (
            <div className="flex gap-3 overflow-x-auto">
              {app.screenshots.map((source, index) => (
                <img
                  key={source}
                  src={source}
                  alt={`${app.name} screenshot ${index + 1}`}
                  className="max-h-64 rounded-xl"
                  loading="lazy"
                />
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {app.tags?.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-neutral-500/5 px-3 py-1.5 text-xs text-neutral-500"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-neutral-200/60 pt-5 text-sm dark:border-white/10">
            <div>
              <p className="text-neutral-400">Source</p>
              <p className="mt-2">
                {app.source === "homios" ? "HomiOS catalog" : "Coolify catalog"}
              </p>
            </div>
            {app.version && (
              <div>
                <p className="text-neutral-400">Version</p>
                <p className="mt-2">{app.version}</p>
              </div>
            )}
            {app.requirements?.recommendedRamMb && (
              <div>
                <p className="text-neutral-400">Recommended memory</p>
                <p className="mt-2">{app.requirements.recommendedRamMb} MB</p>
              </div>
            )}
            {app.port && (
              <div>
                <p className="text-neutral-400">Service port</p>
                <p className="mt-2">{app.port}</p>
              </div>
            )}
          </div>
          {app.documentation && (
            <a
              href={app.documentation}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-button ui-button-secondary"
            >
              <BookOpen size={15} />
              Documentation
              <ExternalLink size={12} />
            </a>
          )}
        </section>
        <aside className="space-y-4">
          {(state?.error || installError) && (
            <ErrorPanel message={state?.error || installError!} />
          )}
          {installed ? (
            <section className="rounded-2xl border border-neutral-200/70 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[.025]">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Server size={17} />
                Manage app
              </h2>
              {!managed && (
                <p className="mb-4 text-sm text-neutral-500">
                  This app is managed outside HomiOS. Open Coolify to change its
                  configuration.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={
                    !available ||
                    !managed ||
                    busy ||
                    installed.status === "running"
                  }
                  onClick={() => onAction("start")}
                >
                  <Play size={15} />
                  Start
                </Button>
                <Button
                  disabled={
                    !available ||
                    !managed ||
                    busy ||
                    installed.status === "stopped"
                  }
                  onClick={() => onAction("stop")}
                >
                  <Square size={14} />
                  Stop
                </Button>
                <Button
                  disabled={
                    !available ||
                    !managed ||
                    busy ||
                    installed.status === "stopped"
                  }
                  onClick={() => onAction("restart")}
                >
                  <RotateCw size={15} />
                  Restart
                </Button>
                <Button
                  disabled={!available || !managed || busy}
                  onClick={() => onAction("deploy")}
                >
                  <RotateCw size={15} />
                  Redeploy
                </Button>
                <Button disabled={!available || !managed} onClick={onLogs}>
                  <FileText size={15} />
                  Logs
                </Button>
                <Button
                  disabled={!available || !managed || busy}
                  onClick={onDomains}
                >
                  <Globe2 size={15} />
                  Addresses
                </Button>
              </div>
              {installed.primaryUrl && (
                <p className="mt-4 break-all text-xs text-neutral-400">
                  {installed.primaryUrl}
                </p>
              )}
              {!!app.storage.length && (
                <div className="mt-5 border-t border-neutral-200/60 pt-4 dark:border-white/10">
                  <p className="mb-3 flex items-center gap-2 text-sm">
                    <HardDrive size={15} />
                    {installed.storage?.accessAllMounts
                      ? "All storage access enabled"
                      : "Selected app-data mounts"}
                  </p>
                  <Button
                    disabled={!available || !managed || !storageAware || busy}
                    className="w-full"
                    onClick={() =>
                      onStorage(!installed.storage?.accessAllMounts)
                    }
                  >
                    {installed.storage?.accessAllMounts
                      ? "Revoke all-storage access"
                      : "Grant all-storage access"}
                  </Button>
                  {!storageAware && (
                    <p className="mt-2 text-xs text-neutral-400">
                      Requires the local HomiOS Coolify server.
                    </p>
                  )}
                </div>
              )}
              <Button
                variant="danger"
                className="mt-5 w-full"
                disabled={!available || !managed || busy}
                onClick={() => onAction("remove")}
              >
                <Trash2 size={15} />
                Remove app
              </Button>
            </section>
          ) : (
            <section className="rounded-2xl border border-neutral-200/70 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[.025]">
              <h2 className="text-sm font-semibold">Install on your server</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                HomiOS will configure this app through Coolify. Installation
                continues in the background.
              </p>
              {!!app.storage.length && (
                <>
                  {mountsError && (
                    <ErrorPanel message={mountsError} onRetry={onRetryMounts} />
                  )}
                  <StorageMountSelector
                    mounts={mounts.filter((mount) => !mount.readOnly)}
                    selectedIds={selectedMounts}
                    accessAllMounts={accessAll}
                    disabled={!storageAware || mountsLoading}
                    onChange={setSelectedMounts}
                    onAccessAllChange={setAccessAll}
                  />
                </>
              )}
              {activeInstall && (
                <div className="mt-5" role="status">
                  <StatusBadge state={getInstallJobState(job) || "queued"} />
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-500/10">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-[width]"
                      style={{
                        width: `${Math.max(0, Math.min(100, job.progress || 0))}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">
                    {job.progress || 0}% ·{" "}
                    {job.progressMessage || "Waiting for server progress"}
                  </p>
                </div>
              )}
              {["failed", "cancelled"].includes(job?.status) && (
                <div className="mt-4">
                  <ErrorPanel
                    message={
                      job.status === "cancelled"
                        ? "Installation was cancelled."
                        : job.error || "Installation failed. You can try again."
                    }
                  />
                </div>
              )}
              <Button
                variant="primary"
                busy={installBusy}
                disabled={installDisabled}
                className="mt-5 w-full"
                onClick={() => onInstall(validMounts, accessAll)}
              >
                {activeInstall
                  ? "Installing…"
                  : ["failed", "cancelled"].includes(job?.status)
                    ? "Retry installation"
                    : "Install app"}
              </Button>
              {!available && (
                <p className="mt-3 text-sm text-neutral-400">
                  Connect Coolify to install this app.
                </p>
              )}
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
