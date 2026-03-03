import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// GET /api/auth/google - Supabase Google OAuth redirect or callback
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  // Callback from Supabase (PKCE code exchange)
  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Supabase code exchange error:', error.message);
        return NextResponse.redirect(new URL('/welcome?error=auth_failed', request.url));
      }

      // Sync user to our users table
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { queryOne } = require('@/backend/config/database');
        await queryOne(
          `INSERT INTO users (id, google_id, email, name, avatar_url)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (google_id) DO UPDATE SET
             email = EXCLUDED.email,
             name = EXCLUDED.name,
             avatar_url = EXCLUDED.avatar_url,
             updated_at = NOW()
           RETURNING id`,
          [
            user.id,
            user.user_metadata?.sub || user.id,
            user.email,
            user.user_metadata?.full_name || user.user_metadata?.name || null,
            user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          ]
        );
      }

      const callbackUrl = searchParams.get('next') || '/dashboard';
      return NextResponse.redirect(new URL(callbackUrl, request.url));
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      return NextResponse.redirect(new URL('/welcome?error=auth_failed', request.url));
    }
  }

  // Initial auth request — redirect to Supabase Google OAuth
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${request.nextUrl.origin}/api/auth/google?next=${encodeURIComponent(callbackUrl)}`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error || !data.url) {
    console.error('Supabase OAuth initiation error:', error?.message);
    return NextResponse.redirect(new URL('/welcome?error=auth_failed', request.url));
  }

  return NextResponse.redirect(data.url);
}
