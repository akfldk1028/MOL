'use client';

import * as React from 'react';
import { cn } from '@/common/lib/utils';
import { Textarea } from '@/common/ui';

interface MentionOption {
  name: string;
  displayName?: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  agents?: MentionOption[];
}

export function MentionInput({ value, onChange, placeholder, className, agents = [] }: MentionInputProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState('');
  const [cursorPosition, setCursorPosition] = React.useState(0);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const filteredAgents = React.useMemo(() => {
    if (!mentionQuery) return agents.slice(0, 8);
    const q = mentionQuery.toLowerCase();
    return agents.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.displayName && a.displayName.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [agents, mentionQuery]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const pos = e.target.selectionStart || 0;
    setCursorPosition(pos);

    // Check if we're in a @mention context
    const textBefore = newValue.slice(0, pos);
    const mentionMatch = textBefore.match(/@([\w\u3131-\u318E\uAC00-\uD7A3._]{0,32})$/i);

    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setShowSuggestions(true);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
    }
  };

  const insertMention = (agentName: string) => {
    const textBefore = value.slice(0, cursorPosition);
    const mentionStart = textBefore.lastIndexOf('@');
    const textAfter = value.slice(cursorPosition);

    const newValue = textBefore.slice(0, mentionStart) + `@${agentName} ` + textAfter;
    onChange(newValue);
    setShowSuggestions(false);

    // Refocus textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = mentionStart + agentName.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || filteredAgents.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredAgents.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(filteredAgents[selectedIndex].name);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        className={cn('min-h-[80px] text-sm', className)}
      />

      {showSuggestions && filteredAgents.length > 0 && (
        <div className="absolute left-0 bottom-full mb-1 w-64 max-h-48 overflow-y-auto border rounded-md bg-popover shadow-lg z-20">
          {filteredAgents.map((agent, i) => (
            <button
              key={agent.name}
              type="button"
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2',
                i === selectedIndex && 'bg-muted'
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(agent.name);
              }}
            >
              <span className="font-medium">@{agent.name}</span>
              {agent.displayName && (
                <span className="text-muted-foreground text-xs">{agent.displayName}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
