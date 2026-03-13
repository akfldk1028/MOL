'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea } from '@/components/ui';
import { Loader2, Send, X, Upload, ImagePlus, FileUp } from 'lucide-react';
import CreativeTypeSelector from './CreativeTypeSelector';
import type { CreationType } from '@/types';

const GENRE_OPTIONS: Record<CreationType, string[]> = {
  novel: ['Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Thriller', 'Literary Fiction', 'Horror', 'Historical', 'Other'],
  webtoon: ['Romance', 'Action', 'Fantasy', 'Slice of Life', 'Thriller', 'Comedy', 'Drama', 'Horror', 'Other'],
  book: ['Fiction', 'Non-Fiction', 'Philosophy', 'History', 'Science', 'Poetry', 'Essay', 'Literary Criticism', 'Other'],
  contest: ['Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Thriller', 'Literary Fiction', 'Horror', 'Historical', 'Other'],
  music: ['Pop', 'Rock', 'Hip-Hop', 'R&B', 'Jazz', 'Classical', 'Electronic', 'Indie', 'Other'],
  illustration: ['Digital Art', 'Traditional', 'Concept Art', 'Character Design', 'Landscape', 'Abstract', 'Comic', 'Other'],
  screenplay: ['Drama', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi', 'Romance', 'Action', 'Documentary', 'Other'],
};

export default function CreationForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [creationType, setCreationType] = useState<CreationType>('novel');
  const [genre, setGenre] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed) && tags.length < 5) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 10) {
      setError('Maximum 10 images allowed');
      return;
    }

    const newImages = [...images, ...files].slice(0, 10);
    setImages(newImages);

    // Generate previews
    const newPreviews = newImages.map(f => URL.createObjectURL(f));
    // Revoke old previews
    imagePreviews.forEach(url => URL.revokeObjectURL(url));
    setImagePreviews(newPreviews);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setImages(images.filter((_, i) => i !== index));
    setImagePreviews(imagePreviews.filter((_, i) => i !== index));
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are allowed');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('PDF must be under 50MB');
      return;
    }

    setPdfFile(file);
    setPdfUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const res = await fetch('/api/creations/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'PDF upload failed');
      }

      const data = await res.json();
      setContent(data.text);
      if (data.info?.title && !title) {
        setTitle(data.info.title);
      }
    } catch (err) {
      setError((err as Error).message);
      setPdfFile(null);
    } finally {
      setPdfUploading(false);
      // Reset input so same file can be re-selected
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please enter a title for your work');
      return;
    }
    if (!content.trim()) {
      setError('Please paste your creative work content');
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload images first if any
      let imageUrls: string[] = [];
      if (images.length > 0) {
        const formData = new FormData();
        images.forEach(img => formData.append('images', img));

        const uploadRes = await fetch('/api/creations/upload', {
          method: 'POST',
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          imageUrls = uploadData.imageUrls || [];
        }
      }

      // Create the critique
      const domainMap: Record<CreationType, string> = {
        novel: 'novel', webtoon: 'webtoon', book: 'book', contest: 'novel',
        music: 'novel', illustration: 'novel', screenplay: 'novel',
      };
      const res = await fetch('/api/creations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          creationType,
          genre: genre || undefined,
          tags,
          domain: domainMap[creationType],
          imageUrls,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit creation');
      }

      const data = await res.json();
      router.push(`/c/${data.creation.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const charCount = content.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <CreativeTypeSelector selected={creationType} onChange={(t) => { setCreationType(t); setGenre(''); }} />

      <div className="space-y-2">
        <label className="text-sm font-medium">Title *</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title of your work"
          maxLength={300}
          className="text-lg"
        />
        <p className="text-xs text-muted-foreground">{title.length}/300</p>
      </div>

      {/* PDF upload for book analysis */}
      {creationType === 'book' && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Upload PDF (optional)</label>
          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => pdfInputRef.current?.click()}
          >
            <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            {pdfUploading ? (
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Extracting text from PDF...
              </p>
            ) : pdfFile ? (
              <p className="text-sm text-primary">{pdfFile.name}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Click to upload a PDF file</p>
                <p className="text-xs text-muted-foreground mt-1">Max 50MB, text-based PDFs only (not scanned images)</p>
              </>
            )}
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handlePdfUpload}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">
          {creationType === 'webtoon' ? 'Script / Dialogue' : creationType === 'book' ? 'Book Text' : creationType === 'contest' ? 'Your Submission' : 'Your Work'} *
        </label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            creationType === 'webtoon'
              ? 'Paste your webtoon script, dialogue, or story outline here...'
              : creationType === 'book'
              ? 'Paste book text here, or upload a PDF above to auto-extract...'
              : creationType === 'contest'
              ? 'Paste your contest submission here...'
              : 'Paste your novel, short story, or chapter here...'
          }
          rows={12}
          className="font-mono text-sm"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{wordCount.toLocaleString()} words / {charCount.toLocaleString()} characters</span>
          {charCount > 30000 && (
            <span className="text-yellow-600">Long text will be summarized for agents</span>
          )}
        </div>
      </div>

      {/* Image upload for webtoons */}
      {creationType === 'webtoon' && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Panels / Images (optional, max 10)</label>
          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Click to upload panel images</p>
            <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF, WebP (max 10MB each)</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>
          {imagePreviews.length > 0 && (
            <div className="grid grid-cols-5 gap-2 mt-2">
              {imagePreviews.map((preview, i) => (
                <div key={i} className="relative group aspect-square rounded-md overflow-hidden border">
                  <img src={preview} alt={`Panel ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Genre</label>
        <div className="flex flex-wrap gap-2">
          {GENRE_OPTIONS[creationType].map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGenre(genre === g ? '' : g)}
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                genre === g
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Tags (optional)</label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="Add a tag..."
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={addTag} disabled={tags.length >= 5}>
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
                {tag}
                <button type="button" onClick={() => removeTag(tag)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">What happens next?</p>
        {creationType === 'book' || creationType === 'contest' ? (
          <p>5 community members will conduct an in-depth analysis of your {creationType === 'book' ? 'book' : 'submission'} — exploring themes, structure, critical theory, cultural context, and more. They&apos;ll discuss in 3 rounds before producing a comprehensive scholarly assessment.</p>
        ) : (
          <p>5 community members will analyze your {creationType === 'webtoon' ? 'webtoon' : 'work'} across multiple dimensions — structure, characters, style, consistency, and more. They&apos;ll discuss their critiques in 3 rounds before producing a comprehensive editorial review.</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting || !title.trim() || !content.trim()} className="w-full">
        {isSubmitting ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
        ) : creationType === 'book' || creationType === 'contest' ? (
          <><Send className="h-4 w-4 mr-2" /> Submit for Analysis</>
        ) : (
          <><Send className="h-4 w-4 mr-2" /> Submit for Critique</>
        )}
      </Button>
    </form>
  );
}
