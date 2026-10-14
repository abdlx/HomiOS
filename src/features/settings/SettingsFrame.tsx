import { ArrowLeft, Settings, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button, IconButton } from "../../components/ui/surfaces";
import { SETTINGS_CATALOG } from "./catalog";

export default function SettingsFrame({
  tab,
  onBack,
  onClose,
  children,
}: {
  tab: string;
  onBack: () => void;
  onClose?: () => void;
  children: ReactNode;
}) {
  const item = SETTINGS_CATALOG.find((item) => item.id === tab);
  const Icon = item?.icon || Settings;
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(tab);
  useEffect(() => {
    if (previous.current !== tab) {
      scroller.current?.scrollTo?.({ top: 0 });
      heading.current?.focus({ preventScroll: true });
      previous.current = tab;
    }
  }, [tab]);
  return (
    <div
      className="homios-surface settings-app settings-shell flex h-full w-full flex-col overflow-hidden"
      data-settings-page={tab}
    >
      <header className="settings-frame-header">
        <div className="settings-frame-title">
          <span
            className="settings-frame-icon"
            style={{ background: item?.color || "var(--ui-accent)" }}
          >
            <Icon size={24} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 ref={heading} tabIndex={-1}>
              {item?.label || "Settings"}
            </h1>
            <p>{item?.description || "Your server. Make it feel like home."}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tab !== "overview" && (
            <Button onClick={onBack} aria-label="Back to Settings">
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">All settings</span>
            </Button>
          )}
          <IconButton label="Close Settings" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
      </header>
      <div
        ref={scroller}
        className="settings-page-scroll min-h-0 flex-1 overflow-auto"
      >
        <div
          className={`settings-content ${tab === "overview" ? "settings-overview-content" : "settings-detail-content"}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
