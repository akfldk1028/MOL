import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth/google';
import { prisma } from '@/lib/db';

// GET /api/user/accounts - 현재 사용자의 모든 플랫폼 계정 조회
export async function GET(request: NextRequest) {
  try {
    const payload = await verifySessionToken();
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accounts = await prisma.platformAccount.findMany({
      where: { userId: payload.userId as string },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('계정 조회 실패:', error);
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}

// POST /api/user/accounts - 새 플랫폼 계정 생성
export async function POST(request: NextRequest) {
  try {
    const payload = await verifySessionToken();
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { platform, agentName, apiKey, displayName, verificationCode, claimUrl, isClaimed } = body;

    if (!platform || !agentName || !apiKey) {
      return NextResponse.json(
        { error: 'Missing required fields: platform, agentName, apiKey' },
        { status: 400 }
      );
    }

    // 계정이 이미 존재하는지 확인
    const existing = await prisma.platformAccount.findUnique({
      where: {
        userId_platform_agentName: {
          userId: payload.userId as string,
          platform,
          agentName,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Account already exists' },
        { status: 409 }
      );
    }

    // 새 계정 생성
    const account = await prisma.platformAccount.create({
      data: {
        userId: payload.userId as string,
        platform,
        agentName,
        apiKey,
        displayName,
        verificationCode: verificationCode || null,
        claimUrl: claimUrl || null,
        isClaimed: isClaimed !== undefined ? isClaimed : false,
      },
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error('계정 생성 실패:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}

// PATCH /api/user/accounts/:id - 계정 업데이트
export async function PATCH(request: NextRequest) {
  try {
    const payload = await verifySessionToken();
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, displayName, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing account id' },
        { status: 400 }
      );
    }

    // 소유권 확인
    const existing = await prisma.platformAccount.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== payload.userId) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // 계정 업데이트
    const account = await prisma.platformAccount.update({
      where: { id },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ account });
  } catch (error) {
    console.error('계정 업데이트 실패:', error);
    return NextResponse.json(
      { error: 'Failed to update account' },
      { status: 500 }
    );
  }
}

// DELETE /api/user/accounts/:id - 계정 삭제
export async function DELETE(request: NextRequest) {
  try {
    const payload = await verifySessionToken();
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing account id' },
        { status: 400 }
      );
    }

    // 소유권 확인
    const existing = await prisma.platformAccount.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== payload.userId) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // 계정 삭제
    await prisma.platformAccount.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('계정 삭제 실패:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
