import { useEffect, useState } from "react";
import type { InstalledApp } from "../../../hooks/useInstalledApps";
import type { DomainRoute } from "../types";
import { useRemoteResource } from "../../../hooks/useRemoteResource";
import {
  Button,
  ErrorPanel,
  Sheet,
  Skeleton,
} from "../../../components/ui/surfaces";
export default function AppDomains({
  app,
  onClose,
  onSaved,
}: {
  app: InstalledApp;
  onClose: () => void;
  onSaved: () => void;
}) {
  const resource = useRemoteResource<{ routes: DomainRoute[] }>(
    `/api/apps/${encodeURIComponent(app.id)}/domains`,
  );
  const [routes, setRoutes] = useState<DomainRoute[]>([]);
  const [conflicts, setConflicts] = useState<
    Array<{ domain: string; resource_name?: string }>
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (resource.data) setRoutes(resource.data.routes);
  }, [resource.data]);
  async function save(force = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/apps/${encodeURIComponent(app.id)}/domains`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ routes, force }),
        },
      );
      const value = await response.json();
      if (!response.ok) {
        setConflicts(value.conflicts || []);
        throw new Error(value.error || "Could not save app addresses");
      }
      onSaved();
      onClose();
    } catch (next) {
      setError(
        next instanceof Error ? next.message : "Could not save app addresses",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={`${app.name} · Addresses`} onClose={onClose}>
      <div className="space-y-4 overflow-auto p-5">
        <p className="text-xs leading-6 text-neutral-500">
          Set the web addresses routed by Coolify.
        </p>
        {(resource.error || error) && (
          <ErrorPanel
            message={resource.error || error}
            onRetry={resource.error ? () => void resource.refresh() : undefined}
          />
        )}{" "}
        {resource.loading ? (
          <Skeleton className="h-20" />
        ) : (
          routes.map((route, index) => (
            <label key={index} className="block text-xs font-medium">
              {route.name}
              <input
                type="url"
                aria-label={`${route.name} address`}
                value={route.url}
                placeholder="https://app.example.com"
                onChange={(event) => {
                  setRoutes((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, url: event.target.value } : item,
                    ),
                  );
                  setConflicts([]);
                }}
                className="mt-2 min-h-11 w-full rounded-xl border border-neutral-200 bg-transparent px-3 text-sm dark:border-white/10"
              />
              {conflicts
                .filter((conflict) => route.url.includes(conflict.domain))
                .map((conflict) => (
                  <p
                    key={conflict.domain}
                    className="mt-2 text-xs text-red-500"
                  >
                    {conflict.domain} is already used by{" "}
                    {conflict.resource_name || "another app"}.
                  </p>
                ))}
            </label>
          ))
        )}
        {!resource.loading && !routes.length && (
          <p className="text-xs text-neutral-500">
            Coolify did not report a routable web container.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {conflicts.length > 0 ? (
            <Button
              variant="danger"
              busy={busy}
              onClick={() => void save(true)}
            >
              Use domain anyway
            </Button>
          ) : (
            <Button
              variant="primary"
              busy={busy}
              disabled={!routes.length || !!resource.error}
              onClick={() => void save()}
            >
              Save addresses
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
