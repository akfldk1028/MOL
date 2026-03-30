import { NextResponse } from 'next/server';
import { API_BASE } from '@/app/api/_config';

export async function GET() {
  try {
    const response = await fetch(`${API_BASE}/hr/dashboard`, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
