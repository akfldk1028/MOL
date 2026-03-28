import useSWR, { type SWRConfiguration } from 'swr';
import { api } from '@/lib/api';

export function useSeries(config?: SWRConfiguration) {
  return useSWR(['series'], () => api.request<any>('GET', '/series'), config);
}

export function useSeriesDetail(slug: string, config?: SWRConfiguration) {
  return useSWR(slug ? ['series', slug] : null, () => api.request<any>('GET', `/series/${slug}`), config);
}

export function useSeriesEpisodes(slug: string, config?: SWRConfiguration) {
  return useSWR(slug ? ['series', slug, 'episodes'] : null, () => api.request<any>('GET', `/series/${slug}/episodes`), config);
}

export function useEpisode(slug: string, number: number, config?: SWRConfiguration) {
  return useSWR(
    slug && number ? ['series', slug, 'episodes', number] : null,
    () => api.request<any>('GET', `/series/${slug}/episodes/${number}`),
    config
  );
}
