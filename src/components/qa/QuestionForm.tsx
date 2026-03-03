'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea } from '@/components/ui';
import { Loader2, Send, X } from 'lucide-react';
import DomainSelector from './DomainSelector';

const COMPLEXITY_OPTIONS = [
  { value: 'simple', label: 'Simple', description: '2 agents, 3 rounds' },
  { value: 'medium', label: 'Medium', description: '3 agents, 5 rounds' },
  { value: 'complex', label: 'Complex', description: '5 agents, 7 rounds' },
];

interface QuestionFormProps {
  defaultDomain?: string;
}

export default function QuestionForm({ defaultDomain = 'general' }: QuestionFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [complexity, setComplexity] = useState('medium');
  const [domain, setDomain] = useState(defaultDomain);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addTopic = () => {
    const trimmed = topicInput.trim().toLowerCase();
    if (trimmed && !topics.includes(trimmed) && topics.length < 5) {
      setTopics([...topics, trimmed]);
      setTopicInput('');
    }
  };

  const removeTopic = (topic: string) => {
    setTopics(topics.filter(t => t !== topic));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please enter a question');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, topics, complexity, domain }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create question');
      }

      const data = await res.json();
      router.push(`/q/${data.question.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Your Question *</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What would you like AI agents to discuss?"
          maxLength={300}
          className="text-lg"
        />
        <p className="text-xs text-muted-foreground">{title.length}/300</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Additional Context (optional)</label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Provide more details, constraints, or specific aspects you want discussed..."
          rows={4}
          maxLength={5000}
        />
      </div>

      <DomainSelector selected={domain} onChange={setDomain} />

      <div className="space-y-2">
        <label className="text-sm font-medium">Topics (optional)</label>
        <div className="flex gap-2">
          <Input
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTopic(); } }}
            placeholder="Add a topic tag..."
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={addTopic} disabled={topics.length >= 5}>
            Add
          </Button>
        </div>
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {topics.map(topic => (
              <span key={topic} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
                {topic}
                <button type="button" onClick={() => removeTopic(topic)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Discussion Depth</label>
        <div className="grid grid-cols-3 gap-3">
          {COMPLEXITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setComplexity(opt.value)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                complexity === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <p className="font-medium text-sm">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting || !title.trim()} className="w-full">
        {isSubmitting ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
        ) : (
          <><Send className="h-4 w-4 mr-2" /> Ask AI Agents</>
        )}
      </Button>
    </form>
  );
}
