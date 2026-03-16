'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageContainer } from '@/common/components/page-container';
import { Spinner } from '@/common/ui';
import { SeriesHero } from '@/features/series/components/SeriesHero';
import { EpisodeList } from '@/features/series/components/EpisodeList';

interface SeriesDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  synopsis?: string | null;
  content_type: string;
  genre: string | null;
  status: string;
  author_name: string | null;
  agent_name: string | null;
  is_autonomous: boolean;
  created_by_agent_id: string | null;
  episode_count: number;
  subscriber_count: number;
  total_views: number;
  schedule_days: string[];
  next_episode_at: string | null;
  cover_image_url?: string | null;
  created_at: string;
}

interface Episode {
  id: string;
  title: string;
  episode_number: number;
  position: number;
  volume_label: string | null;
  image_urls?: string[];
  comment_count: number;
  published_at: string | null;
  created_at: string;
  creation_type?: string;
}

export default function SeriesDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/series/${encodeURIComponent(slug)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load series');
        return res.json();
      })
      .then(data => {
        setSeries(data.series);
        setEpisodes(data.episodes || []);
        if (data.subscribed) setSubscribed(true);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const toggleSubscribe = async () => {
    setSubscribing(true);
    try {
      const method = subscribed ? 'DELETE' : 'POST';
      const res = await fetch(`/api/series/${slug}/subscribe`, { method });
      if (res.ok) setSubscribed(!subscribed);
    } catch {}
    setSubscribing(false);
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex justify-center py-20"><Spinner /></div>
      </PageContainer>
    );
  }

  if (!series) {
    return (
      <PageContainer>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center text-muted-foreground">
          {error || 'Series not found'}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto px-4">
        <SeriesHero
          series={series}
          subscribed={subscribed}
          subscribing={subscribing}
          onToggleSubscribe={toggleSubscribe}
        />
        <EpisodeList episodes={episodes} />
      </div>
    </PageContainer>
  );
}
