'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/common/components/page-container';
import { BookOpen, Image, Music, Palette, Film } from 'lucide-react';

const TYPES = [
  { value: 'novel', label: 'Novel', icon: BookOpen, color: 'text-violet-600', bg: 'bg-violet-500/10', desc: 'Serialized fiction' },
  { value: 'webtoon', label: 'Webtoon', icon: Image, color: 'text-pink-600', bg: 'bg-pink-500/10', desc: 'Visual storytelling' },
  { value: 'music', label: 'Music Album', icon: Music, color: 'text-emerald-600', bg: 'bg-emerald-500/10', desc: 'Track collection' },
  { value: 'illustration', label: 'Art Series', icon: Palette, color: 'text-rose-600', bg: 'bg-rose-500/10', desc: 'Illustration set' },
  { value: 'screenplay', label: 'Script', icon: Film, color: 'text-indigo-600', bg: 'bg-indigo-500/10', desc: 'Multi-act screenplay' },
];

const SCHEDULE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

export default function CreateSeriesPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState('novel');
  const [genre, setGenre] = useState('');
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleDay = (day: string) => {
    setScheduleDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const finalSlug = slug || slugify(title);
      const res = await fetch('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          slug: finalSlug,
          description: description.trim() || null,
          contentType,
          genre: genre || null,
          scheduleDays,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create series');
        return;
      }

      const data = await res.json();
      router.push(`/series/${data.series?.slug || finalSlug}`);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <div className="max-w-xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold mb-6">Create Series</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Type selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setContentType(t.value)}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                      contentType === t.value
                        ? 'border-foreground bg-accent'
                        : 'border-border hover:bg-accent/50'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${t.color}`} />
                    <div>
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-[11px] text-muted-foreground">{t.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-sm font-medium mb-1 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                if (!slug) setSlug(slugify(e.target.value));
              }}
              placeholder="My Series Title"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
              required
            />
          </div>

          {/* Slug */}
          <div>
            <label className="text-sm font-medium mb-1 block">URL Slug</label>
            <input
              type="text"
              value={slug || slugify(title)}
              onChange={e => setSlug(e.target.value)}
              placeholder="my-series-title"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-mono"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description..."
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm resize-none"
            />
          </div>

          {/* Genre */}
          <div>
            <label className="text-sm font-medium mb-1 block">Genre</label>
            <input
              type="text"
              value={genre}
              onChange={e => setGenre(e.target.value)}
              placeholder="Fantasy, Sci-Fi, Pop..."
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="text-sm font-medium mb-2 block">Schedule (optional)</label>
            <div className="flex gap-1.5">
              {SCHEDULE_DAYS.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`w-10 h-10 rounded-lg text-xs font-medium transition-colors ${
                    scheduleDays.includes(day)
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="w-full py-2.5 rounded-lg bg-foreground text-background font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? 'Creating...' : 'Create Series'}
          </button>
        </form>
      </div>
    </PageContainer>
  );
}
