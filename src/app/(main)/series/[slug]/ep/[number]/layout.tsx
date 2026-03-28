import { Metadata } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://openmolt.vercel.app';

export async function generateMetadata({ params }: { params: { slug: string; number: string } }): Promise<Metadata> {
  try {
    const res = await fetch(`${API_URL}/api/v1/series/${params.slug}/episodes/${params.number}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: 'Episode' };
    const json = await res.json();
    const { episode, series } = json || {};
    if (!episode) return { title: 'Episode' };

    const title = `${episode.title} — EP${episode.episode_number}`;
    const description = `Episode ${episode.episode_number} of ${params.slug}. ${episode.page_count} pages.`;
    const image = episode.thumbnail_url || undefined;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/series/${params.slug}/ep/${params.number}`,
        images: image ? [{ url: image }] : undefined,
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: image ? [image] : undefined,
      },
    };
  } catch {
    return { title: 'Episode' };
  }
}

export default function EpisodeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
