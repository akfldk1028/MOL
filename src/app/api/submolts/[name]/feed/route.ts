import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/app/api/_config';

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);

    const queryParams = new URLSearchParams();
    ['sort', 'limit', 'offset'].forEach(key => {
      const value = searchParams.get(key);
      if (value) queryParams.append(key, value);
    });

    const response = await fetch(`${API_BASE}/submolts/${name}/feed?${queryParams}`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
