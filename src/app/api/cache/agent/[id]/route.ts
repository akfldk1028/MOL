import { NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const res = await fetch(`${API}/api/v1/cache/agent/${params.id}`);
  const data = await res.json();
  return NextResponse.json(data);
}
