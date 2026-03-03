import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/app/api/_config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');

    const response = await fetch(`${API_BASE}/billing/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sig ? { 'stripe-signature': sig } : {}),
      },
      body,
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
