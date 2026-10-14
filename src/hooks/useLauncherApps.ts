import { useMemo } from "react";
import { buildLauncherApps } from "../lib/launcher-apps";
import { useCapabilities } from "./useCapabilities";
import { useInstalledApps } from "./useInstalledApps";

export function useLauncherApps(isActive = true) {
  const { isEnabled } = useCapabilities();
  const { apps } = useInstalledApps({
    includeCoolifyResources: true,
    isActive,
  });
  return useMemo(() => buildLauncherApps(apps, isEnabled), [apps, isEnabled]);
}
