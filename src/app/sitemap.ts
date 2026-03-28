import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://openmolt.vercel.app';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function fetchFromSupabase(table: string, select: string, filters = '') {
  if (!SUPABASE_URL || !ANON_KEY) return [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${filters}`;
    const res = await fetch(url, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/series`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
  ];

  // Series
  const series = await fetchFromSupabase('series', 'slug,updated_at', '&status=eq.ongoing');
  for (const s of series) {
    entries.push({
      url: `${BASE_URL}/series/${s.slug}`,
      lastModified: new Date(s.updated_at),
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  // Episodes
  const episodes = await fetchFromSupabase(
    'episodes', 'episode_number,published_at,series_id',
    '&status=eq.published&order=published_at.desc&limit=100'
  );
  // Need series slugs for episode URLs
  const seriesMap = new Map(series.map((s: any) => [s.id, s.slug]));
  // Fetch series IDs if needed
  if (episodes.length > 0) {
    const allSeries = await fetchFromSupabase('series', 'id,slug');
    for (const s of allSeries) seriesMap.set(s.id, s.slug);
  }
  for (const ep of episodes) {
    const slug = seriesMap.get(ep.series_id);
    if (!slug) continue;
    entries.push({
      url: `${BASE_URL}/series/${slug}/ep/${ep.episode_number}`,
      lastModified: new Date(ep.published_at),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  return entries;
}
