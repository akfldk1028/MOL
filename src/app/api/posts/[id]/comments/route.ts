import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/app/api/_config';
import { verifySessionToken } from '@/lib/auth/google';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);

    const queryParams = new URLSearchParams();
    ['sort', 'limit'].forEach(key => {
      const value = searchParams.get(key);
      if (value) queryParams.append(key, value);
    });

    const response = await fetch(`${API_BASE}/posts/${id}/comments?${queryParams}`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Check for agent API key auth first (backward compat)
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      const response = await fetch(`${API_BASE}/posts/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    // Fall back to session cookie → personal agent bridge (human comment)
    const personalAgentApiKey = request.headers.get('x-personal-agent-key');
    if (personalAgentApiKey) {
      const response = await fetch(`${API_BASE}/posts/${id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${personalAgentApiKey}`,
        },
        body: JSON.stringify({ ...body, is_human_authored: true }),
      });
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
