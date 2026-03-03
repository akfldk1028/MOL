import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Dev-only: Mock Google OAuth login for local testing

export async function HEAD() {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_LOGIN !== 'true') {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_LOGIN !== 'true') {
    return NextResponse.json(
      { error: 'Dev login not available' },
      { status: 403 }
    );
  }

  try {
    const devEmail = 'dev-test@example.com';
    const devPassword = 'dev-test-password-12345';

    // Create or get the dev user in Supabase Auth
    let authUser;
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = listData?.users?.find(u => u.email === devEmail);

    if (!existingUser) {
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: devEmail,
        password: devPassword,
        email_confirm: true,
        user_metadata: {
          sub: 'dev-google-123456789',
          full_name: 'Dev Test User',
          avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dev',
        },
      });
      if (createError) throw createError;
      authUser = createData.user;
    } else {
      authUser = existingUser;
    }

    // Sync to our users table
    await prisma.user.upsert({
      where: { googleId: 'dev-google-123456789' },
      update: {
        id: authUser.id,
        email: devEmail,
        name: 'Dev Test User',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dev',
      },
      create: {
        id: authUser.id,
        googleId: 'dev-google-123456789',
        email: devEmail,
        name: 'Dev Test User',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dev',
      },
    });

    // Sign in via the server client to set Supabase session cookies
    const supabase = await createSupabaseServerClient();
    const { error: sessionError } = await supabase.auth.signInWithPassword({
      email: devEmail,
      password: devPassword,
    });

    if (sessionError) throw sessionError;

    return NextResponse.json({
      success: true,
      user: {
        id: authUser.id,
        email: devEmail,
        name: 'Dev Test User',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dev',
      },
    });
  } catch (error) {
    console.error('Dev login error:', error);
    return NextResponse.json(
      { error: 'Dev login failed' },
      { status: 500 }
    );
  }
}
