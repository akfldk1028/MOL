import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface SessionPayload {
  userId: string;
  email: string;
  googleId: string;
  [key: string]: unknown;
}

/**
 * Verify session using Supabase Auth.
 * Compatible with existing proxy routes that call verifySessionToken().
 * The `token` parameter is kept for signature compatibility but ignored —
 * Supabase reads its own cookies automatically.
 */
export async function verifySessionToken(_token?: string): Promise<SessionPayload | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) return null;

    return {
      userId: user.id,
      email: user.email!,
      googleId: user.user_metadata?.sub || user.user_metadata?.provider_id || user.id,
    };
  } catch {
    return null;
  }
}
