import { NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET() {
  const res = await fetch(`${API}/api/v1/cache/status`);
  const data = await res.json();
  return NextResponse.json(data);
}
