import { NextRequest } from 'next/server';
import { API_BASE } from '@/app/api/_config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Proxy SSE stream from backend
  const backendUrl = `${API_BASE}/creations/${id}/stream`;

  try {
    const response = await fetch(backendUrl, {
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok || !response.body) {
      return new Response('Stream unavailable', { status: 502 });
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return new Response('Stream error', { status: 502 });
  }
}
