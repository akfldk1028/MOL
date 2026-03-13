import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/app/api/_config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const response = await fetch(`${API_BASE}/creations/${id}`, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
