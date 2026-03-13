import { NextRequest, NextResponse } from 'next/server';
import { API_BASE, INTERNAL_API_SECRET } from '@/app/api/_config';
import { verifySessionToken } from '@/lib/auth/google';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const payload = await verifySessionToken();
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const body = await request.json();

    const response = await fetch(`${API_BASE}/series/${slug}/episodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': payload.userId,
        'X-Internal-Secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
