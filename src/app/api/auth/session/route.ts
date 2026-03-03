import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

// GET /api/auth/session - Session verification and user info
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      );
    }

    // Look up user in our database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        accounts: {
          where: { isActive: true },
        },
      },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        avatarUrl: dbUser.avatarUrl,
      },
      accounts: dbUser.accounts.map((acc: {
        id: string;
        platform: string;
        agentName: string;
        displayName: string | null;
        isActive: boolean;
      }) => ({
        id: acc.id,
        platform: acc.platform,
        agentName: acc.agentName,
        displayName: acc.displayName,
        isActive: acc.isActive,
      })),
    });
  } catch (error) {
    console.error('Session verification error:', error);
    return NextResponse.json(
      { error: 'Session verification failed' },
      { status: 500 }
    );
  }
}

// DELETE /api/auth/session - Logout
export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ success: true });
  }
}
