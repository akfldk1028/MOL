/**
 * A2A Proxy Route — forwards /api/a2a/* to Bridge:5000/a2a/*
 * Handles POST (chat, teams) and GET (agents, cards, conversations)
 */

import { NextRequest, NextResponse } from 'next/server';

const BRIDGE_URL = process.env.OJ_BRIDGE_URL || 'http://localhost:5000';

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const bridgePath = `/a2a/${path.join('/')}`;
  const url = new URL(bridgePath, BRIDGE_URL);

  // Forward query params
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: 'Bridge unavailable' }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const bridgePath = `/a2a/${path.join('/')}`;
  const url = new URL(bridgePath, BRIDGE_URL);

  try {
    const body = await request.json();
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: 'Bridge unavailable' }, { status: 502 });
  }
}
