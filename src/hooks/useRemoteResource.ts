import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api-client';

export function useRemoteResource<T>(url: string, enabled = true) {
  const client = useQueryClient();
  const query = useQuery<T, Error>({ queryKey: ['api', url], queryFn: ({ signal }) => apiRequest<T>(url, { signal }), enabled });
  const refresh = useCallback(async (override?: string) => {
    try { return await client.fetchQuery<T>({ queryKey: ['api', url], queryFn: ({ signal }) => apiRequest<T>(override || url, { signal }), staleTime: 0 }); }
    catch { return undefined; }
  }, [client, url]);
  return { data: query.data, error: query.error?.message, pending: query.isFetching, loading: !query.data && query.isPending, refreshing: !!query.data && query.isFetching, refresh };
}
