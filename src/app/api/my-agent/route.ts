import { NextRequest, NextResponse } from 'next/server';
import { API_BASE, INTERNAL_API_SECRET } from '@/app/api/_config';
import { verifySessionToken } from '@/lib/auth/google';

async function getUserId(_request: NextRequest): Promise<string | null> {
  const payload = await verifySessionToken();
  return payload?.userId ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const response = await fetch(`${API_BASE}/my-agent`, { cache: 'no-store',
      headers: { 'X-User-Id': userId, 'X-Internal-Secret': INTERNAL_API_SECRET },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();

    const response = await fetch(`${API_BASE}/my-agent`, { cache: 'no-store',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-Internal-Secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();

    const response = await fetch(`${API_BASE}/my-agent`, { cache: 'no-store',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-Internal-Secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
