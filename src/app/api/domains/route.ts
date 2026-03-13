import { NextResponse } from 'next/server';
import { API_BASE } from '../_config';

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/domains`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch domains' }, { status: 500 });
  }
}
