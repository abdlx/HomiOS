import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api-client";
import type { BackgroundPollingMode } from "./usePerformanceSettings";
export interface SystemStats {
  cpu: { usagePercent: number; cores: number; model: string; load: number };
  memory: { used: number; free: number; total: number };
  disk: { used: number; free: number; total: number };
  network: Record<
    string,
    {
      address: string;
      family: string;
      internal: boolean;
      netmask: string;
      mac: string;
    }[]
  >;
  os: {
    hostname: string;
    platform: string;
    arch: string;
    version: string;
    uptime: number;
  };
}
export function useSystemStats(
  enabled = true,
  mode: BackgroundPollingMode = "balanced",
) {
  const query = useQuery<SystemStats, Error>({
    queryKey: ["api", "/api/system/stats"],
    queryFn: ({ signal }) => apiRequest("/api/system/stats", { signal }),
    enabled,
    refetchInterval: enabled
      ? { live: 2000, balanced: 5000, quiet: 15000 }[mode]
      : false,
    refetchIntervalInBackground: false,
  });
  return {
    data: query.data,
    loading: query.isPending,
    error: query.error?.message,
    refresh: query.refetch,
  };
}
