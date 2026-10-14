import { useMemo, useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Cpu,
  HardDrive,
  Monitor,
  Search,
} from "lucide-react";
import { Button, EmptyState, Skeleton } from "../../components/ui/surfaces";
import { AppIcon } from "../../components/icons/AppIcons";
import { SETTINGS_CATALOG } from "./catalog";
import { formatBytes } from "../files/lib/files";

export default function SettingsOverview({
  username,
  wallpaper,
  stats,
  drives,
  twoFA,
  onNavigate,
}: {
  username: string;
  wallpaper: string;
  stats: any;
  drives: any[];
  twoFA: any;
  onNavigate: (tab: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const entries = useMemo(
    () =>
      SETTINGS_CATALOG.filter(
        (item) =>
          (filter === "All" || item.group === filter) &&
          `${item.label} ${item.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [query, filter],
  );
  const memory = stats?.memory?.total
    ? (stats.memory.used / stats.memory.total) * 100
    : 0;
  const disk = stats?.disk?.total
    ? (stats.disk.used / stats.disk.total) * 100
    : 0;
  const metrics = [
    {
      name: "Processor",
      value: stats ? `${Math.round(stats.cpu?.usagePercent || 0)}%` : "",
      detail: stats ? `${stats.cpu?.cores || 0} cores · CPU usage` : "",
      progress: stats?.cpu?.usagePercent || 0,
      icon: Cpu,
      color: "#3b82f6",
      tab: "about",
    },
    {
      name: "Memory",
      value: stats ? formatBytes(stats.memory?.used) : "",
      detail: stats
        ? `${formatBytes(stats.memory?.total)} total · ${Math.round(memory)}% used`
        : "",
      progress: memory,
      icon: Monitor,
      color: "#a78bfa",
      tab: "about",
    },
    {
      name: "Storage",
      value: stats ? formatBytes(stats.disk?.free) : "",
      detail: stats ? `Available of ${formatBytes(stats.disk?.total)}` : "",
      progress: disk,
      icon: HardDrive,
      color: "#34d399",
      tab: "storage",
    },
  ];
  return (
    <div className="settings-overview ui-enter">
      <aside className="settings-overview-sidebar">
        <div
          className="settings-device-preview"
          style={{ backgroundImage: `url(${wallpaper})` }}
        >
          <span className="text-[10px] font-medium text-white/80">
            HomiOS · your personal server
          </span>
          <div className="mt-auto flex justify-center gap-2 rounded-2xl border border-white/20 bg-black/20 p-2 backdrop-blur-xl">
            {["files", "notes", "activity", "settings"].map((id) => (
              <AppIcon key={id} id={id} className="h-8 w-8" />
            ))}
          </div>
        </div>
        <div className="settings-account">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-xl font-medium text-blue-500">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{username}</h2>
            <p className="mt-1 truncate text-xs text-neutral-500">
              {stats?.os?.hostname || "Your HomiOS server"}
            </p>
          </div>
        </div>
        <Button className="w-full" onClick={() => onNavigate("appearance")}>
          <Monitor size={15} />
          Make it yours
          <ArrowUpRight size={14} />
        </Button>
        <div className="mt-6 space-y-3 border-t border-neutral-200/60 pt-5 text-xs dark:border-white/10">
          <div className="flex justify-between gap-3">
            <span className="text-neutral-400">System</span>
            <span>
              {stats?.os?.platform || "—"} · {stats?.os?.arch || "—"}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-neutral-400">Uptime</span>
            <span>
              {stats
                ? `${Math.floor((stats.os?.uptime || 0) / 3600)} hours`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-neutral-400">Connected drives</span>
            <span>{drives.filter((drive) => !drive.isSystem).length}</span>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="settings-metrics">
          {metrics.map((metric) => (
            <button
              key={metric.name}
              onClick={() => onNavigate(metric.tab)}
              className="settings-metric"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-500">{metric.name}</p>
                <metric.icon size={16} style={{ color: metric.color }} />
              </div>
              {stats ? (
                <p className="my-3 text-[30px] font-semibold tracking-tight tabular-nums">
                  {metric.value}
                </p>
              ) : (
                <Skeleton className="my-4 h-6 w-24" />
              )}
              <div className="mb-3 h-1 overflow-hidden rounded-full bg-neutral-500/10">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${Math.max(0, Math.min(100, metric.progress))}%`,
                    background: metric.color,
                  }}
                />
              </div>
              <p className="truncate text-xs text-neutral-500">
                {metric.detail || "Reading system information…"}
              </p>
            </button>
          ))}
        </div>
        <div className="relative mt-6">
          <Search
            size={16}
            className="absolute left-4 top-3.5 text-neutral-400"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search settings"
            placeholder="Find a setting…"
            className="min-h-11 w-full rounded-xl border border-neutral-200/70 bg-white/50 pl-11 pr-3 text-sm dark:border-white/10 dark:bg-white/[.03]"
          />
        </div>
        <div className="my-4 flex gap-1 overflow-x-auto">
          {["All", "Personalize", "Server", "Access", "System"].map((group) => (
            <Button
              key={group}
              variant={filter === group ? "secondary" : "ghost"}
              aria-pressed={filter === group}
              onClick={() => setFilter(group)}
            >
              {group}
            </Button>
          ))}
        </div>
        {!entries.length && (
          <EmptyState
            title="No settings found"
            description="Try a different search or category."
          />
        )}
        {["Personalize", "Server", "Access", "System"]
          .filter((group) => entries.some((item) => item.group === group))
          .map((group) => (
            <section key={group} className="mb-6">
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[.12em] text-neutral-400">
                {group}
              </h2>
              <div className="settings-row-group">
                {entries
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className="settings-row"
                      style={{ "--row-accent": item.color } as CSSProperties}
                    >
                      <div className="settings-row-icon">
                        <item.icon size={18} strokeWidth={1.7} />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <h3 className="text-[15px] font-semibold">
                          {item.label}
                        </h3>
                        <p className="mt-1 text-[13px] leading-5 text-neutral-500">
                          {item.description}
                        </p>
                      </div>
                      {item.id === "2fa" && (
                        <span
                          className={`hidden rounded-full px-2 py-1 text-[10px] sm:block ${twoFA?.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-neutral-500/5 text-neutral-400"}`}
                        >
                          {twoFA?.enabled ? "Enabled" : "Set up"}
                        </span>
                      )}
                      <ChevronRight
                        size={15}
                        className="shrink-0 text-neutral-400"
                      />
                    </button>
                  ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
