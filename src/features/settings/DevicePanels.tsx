import type { SystemStats } from "../../hooks/useSystemStats";
import { Skeleton, EmptyState } from "../../components/ui/surfaces";
import { AppIcon } from "../../components/icons/AppIcons";
import { SettingsRow, SettingsSection } from "./SettingsControls";
import { formatBytes } from "../files/lib/files";

export function IdentityPanel({
  username,
  onChange,
  stats,
}: {
  username: string;
  onChange: (value: string) => void;
  stats?: SystemStats;
}) {
  return (
    <SettingsSection
      title="Your HomiOS"
      description="A personal name for a server that belongs to you."
    >
      <SettingsRow
        label="Display name"
        description="Shown on your desktop and in Settings."
      >
        <input
          aria-label="Display name"
          value={username}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Your name"
          maxLength={80}
        />
      </SettingsRow>
      <SettingsRow label="Hostname">
        <span className="settings-readonly-value">
          {stats?.os.hostname || "Reading hostname…"}
        </span>
      </SettingsRow>
      <SettingsRow label="Timezone">
        <span className="settings-readonly-value">
          {Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time"}
        </span>
      </SettingsRow>
      <SettingsRow label="Language">
        <span className="settings-readonly-value">English</span>
      </SettingsRow>
    </SettingsSection>
  );
}
export function AboutPanel({ stats }: { stats?: SystemStats }) {
  return (
    <div className="space-y-4">
      <div className="settings-about-identity">
        <AppIcon id="settings" className="h-20 w-20" />
        <div>
          <h2>HomiOS</h2>
          <p>Your home. Your server. Your rules.</p>
        </div>
      </div>
      <SettingsSection title="System information">
        {!stats ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <>
            <SettingsRow label="Processor">
              <span className="settings-readonly-value">{stats.cpu.model}</span>
            </SettingsRow>
            <SettingsRow label="CPU cores">
              <span className="settings-readonly-value">{stats.cpu.cores}</span>
            </SettingsRow>
            <SettingsRow label="Memory">
              <span className="settings-readonly-value">
                {formatBytes(stats.memory.total)}
              </span>
            </SettingsRow>
            <SettingsRow label="Operating system">
              <span className="settings-readonly-value">
                {stats.os.version || stats.os.platform}
              </span>
            </SettingsRow>
            <SettingsRow label="Architecture">
              <span className="settings-readonly-value">{stats.os.arch}</span>
            </SettingsRow>
            <SettingsRow label="Uptime">
              <span className="settings-readonly-value">
                {Math.floor(stats.os.uptime / 3600)} hours
              </span>
            </SettingsRow>
          </>
        )}
      </SettingsSection>
    </div>
  );
}
export function NetworkPanel({ stats }: { stats?: SystemStats }) {
  if (!stats) return <Skeleton className="h-52" />;
  const interfaces = Object.entries(stats.network || {}).flatMap(
    ([name, addresses]) =>
      addresses
        .filter((address) => address.family === "IPv4")
        .map((address) => ({ ...address, name })),
  );
  if (!interfaces.length)
    return (
      <EmptyState
        title="No IPv4 interfaces found"
        description="Network interfaces will appear here when an address is assigned."
      />
    );
  return (
    <div className="space-y-4">
      {interfaces.map((iface) => (
        <SettingsSection
          key={`${iface.name}:${iface.address}`}
          title={iface.name}
          description={
            iface.internal
              ? "Local loopback interface"
              : "Host network interface"
          }
        >
          <SettingsRow label="IP address">
            <span className="settings-readonly-value font-mono">
              {iface.address}
            </span>
          </SettingsRow>
          <SettingsRow label="Network mask">
            <span className="settings-readonly-value font-mono">
              {iface.netmask}
            </span>
          </SettingsRow>
          <SettingsRow label="MAC address">
            <span className="settings-readonly-value font-mono">
              {iface.mac}
            </span>
          </SettingsRow>
        </SettingsSection>
      ))}
    </div>
  );
}
