import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, FolderOpen, Loader2, X } from "lucide-react";

export function Button({
  variant = "secondary",
  className = "",
  busy = false,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={`ui-button ui-button-${variant} ${className}`}
    >
      {busy && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Button
      {...props}
      variant="ghost"
      aria-label={label}
      title={props.title || label}
      className={`ui-icon-button ${props.className || ""}`}
    >
      {children}
    </Button>
  );
}
export function EmptyState({
  title,
  description,
  action,
  error = false,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  error?: boolean;
}) {
  const Icon = error ? AlertCircle : FolderOpen;
  return (
    <div className="ui-empty" role={error ? "alert" : "status"}>
      <div className="ui-empty-icon">
        <Icon size={28} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ui-error" role="alert">
      <AlertCircle size={18} />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && <Button onClick={onRetry}>Retry</Button>}
    </div>
  );
}
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`ui-skeleton ${className}`} />;
}

export function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    const frame = requestAnimationFrame(() => {
      (
        (ref.current?.querySelector(
          "[autofocus], [data-autofocus]",
        ) as HTMLElement) ||
        ref.current?.querySelector<HTMLElement>(
          "button:not(:disabled), input",
        ) ||
        ref.current
      )?.focus();
    });
    const key = (event: KeyboardEvent) => {
      // Only the topmost dialog owns keyboard interaction.
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const nodes = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ) || [],
      ).filter((node) => !node.closest("[inert]") && !node.hidden);
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (!first) {
        event.preventDefault();
        ref.current?.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", key, true);
      if (previous?.isConnected && !previous.closest("[inert]"))
        previous.focus();
    };
  }, [open]);
  return ref;
}
export function Sheet({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useFocusTrap(true, onClose);
  const id = useId();
  return createPortal(
    <div
      className="ui-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className={`ui-sheet ${wide ? "ui-sheet-wide" : ""}`}
      >
        <header className="ui-sheet-header">
          <h2 id={id}>{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
