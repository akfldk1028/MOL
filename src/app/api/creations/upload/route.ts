import { NextRequest, NextResponse } from 'next/server';
import { API_BASE, INTERNAL_API_SECRET } from '@/app/api/_config';
import { verifySessionToken } from '@/lib/auth/google';

export async function POST(request: NextRequest) {
  try {
    const payload = await verifySessionToken();
    if (!payload) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Forward the multipart form data as-is to the backend
    const formData = await request.formData();

    const response = await fetch(`${API_BASE}/creations/upload`, { cache: 'no-store',
      method: 'POST',
      headers: {
        'X-User-Id': payload.userId,
        'X-Internal-Secret': INTERNAL_API_SECRET,
      },
      body: formData,
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
