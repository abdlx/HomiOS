import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FACTORY_DOCK_APPS, type LauncherApp } from "../lib/launcher-apps";

const defaults = { grid: ["files"], dock: FACTORY_DOCK_APPS, hidden: [] as string[] };
function readIds(key: string, fallback: string[]) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === "string"))]
      : fallback;
  } catch {
    return fallback;
  }
}
export function useLauncherLayout(apps: Record<string, LauncherApp>) {
  const [saved, setSaved] = useState(defaults);
  const current = useRef(saved);
  current.current = saved;
  useEffect(() => {
    const sync = () =>
      setSaved({
        grid: readIds("homios_grid_apps", defaults.grid),
        dock: readIds("homios_dock_apps", defaults.dock),
        hidden: readIds("homios_hidden_desktop_apps", defaults.hidden),
      });
    sync();
    window.addEventListener("homios:launcher-layout-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("homios:launcher-layout-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback(
    (section: "grid" | "dock", ids: string[]) => {
      // Preserve saved positions of temporarily unavailable integrations.
      const next = [
        ...new Set([
          ...ids,
          ...current.current[section].filter((id) => !apps[id]),
        ]),
      ];
      localStorage.setItem(
        section === "grid" ? "homios_grid_apps" : "homios_dock_apps",
        JSON.stringify(next),
      );
      if (section === "grid") {
        const previousGrid = Object.keys(apps).filter((id) =>
          current.current.grid.includes(id) || (!current.current.dock.includes(id) && !current.current.hidden.includes(id)),
        );
        const hidden = [...new Set([...current.current.hidden, ...previousGrid.filter((id) => !ids.includes(id))])]
          .filter((id) => !ids.includes(id));
        localStorage.setItem("homios_hidden_desktop_apps", JSON.stringify(hidden));
      }
      window.dispatchEvent(new Event("homios:launcher-layout-changed"));
    },
    [apps],
  );
  const layout = useMemo(() => {
    const grid = saved.grid.filter((id) => !!apps[id] && !saved.hidden.includes(id));
    const dock = saved.dock.filter((id) => !!apps[id]);
    const missing = Object.keys(apps).filter(
      (id) => !grid.includes(id) && !dock.includes(id) && !saved.hidden.includes(id),
    );
    return { gridAppIds: [...grid, ...missing], dockAppIds: dock };
  }, [saved, apps]);
  return {
    ...layout,
    updateGrid: (ids: string[]) => update("grid", ids),
    updateDock: (ids: string[]) => update("dock", ids),
  };
}
