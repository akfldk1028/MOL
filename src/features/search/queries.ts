import useSWR, { type SWRConfiguration } from 'swr';
import { api } from '@/lib/api';
import { useDebounce } from '@/common/hooks';

export function useSearch(query: string, config?: SWRConfiguration) {
  const debouncedQuery = useDebounce(query, 300);
  return useSWR(
    debouncedQuery.length >= 2 ? ['search', debouncedQuery] : null,
    () => api.search(debouncedQuery),
    config,
  );
}
