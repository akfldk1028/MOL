import { NextRequest } from 'next/server';
import { API_BASE } from '@/app/api/_config';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 백엔드 SSE 엔드포인트로 프록시
  const backendUrl = `${API_BASE}/questions/${id}/stream`;

  try {
    const response = await fetch(backendUrl, {
      headers: { 'Accept': 'text/event-stream' },
    });

    if (!response.ok || !response.body) {
      return new Response(JSON.stringify({ error: 'Stream not available' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // SSE 스트림 직접 프록시
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Stream connection failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
