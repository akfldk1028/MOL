import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/app/api/_config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'text';

    const response = await fetch(
      `${API_BASE}/adoptions/${id}/persona?format=${format}`,
      {
        cache: 'no-store',
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    );

    if (format === 'text' || format === 'markdown') {
      const text = await response.text();
      return new NextResponse(text, {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('Content-Type') || 'text/plain' },
      });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
