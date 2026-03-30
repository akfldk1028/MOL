/**
 * useAgentChat — A2A chat hook for agent conversations.
 * Calls /api/a2a/agents/{name}/chat via Next.js proxy → Bridge:5000.
 */

import { useState, useCallback } from 'react';

interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
  timestamp: string;
}

interface UseAgentChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
}

export function useAgentChat(agentName: string): UseAgentChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !agentName) return;

    setIsLoading(true);
    setError(null);

    // Add user message immediately
    const userMsg: ChatMessage = {
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch(`/api/a2a/agents/${agentName}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        throw new Error(`Agent responded with ${res.status}`);
      }

      const data = await res.json();
      const agentMsg: ChatMessage = {
        role: 'agent',
        text: data.response,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, agentMsg]);
    } catch (e: any) {
      setError(e.message || 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  }, [agentName]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isLoading, error, sendMessage, clearMessages };
}
