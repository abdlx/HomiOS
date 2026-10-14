import { useId, type ReactNode } from "react";

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="settings-section-rows">{children}</div>
    </section>
  );
}
export function SettingsRow({
  label,
  description,
  children,
  compact = false,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="settings-control-row" data-compact={compact || undefined}>
      <div className="min-w-0">
        <h3>{label}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="settings-control-value">{children}</div>
    </div>
  );
}
export function SettingsSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className="settings-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="settings-switch-track">
        <span />
      </span>
    </button>
  );
}
