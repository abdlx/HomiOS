import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5000,
        gcTime: 10 * 60_000,
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
let browserClient: QueryClient | undefined;
/** Server requests get isolated caches; all features in one browser share a cache. */
export function getQueryClient() {
  if (typeof window === "undefined") return createClient();
  return (browserClient ||= createClient());
}
export default function ServerDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [client] = useState(getQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
