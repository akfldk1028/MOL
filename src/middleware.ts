import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that REQUIRE authentication (everything else is public)
const protectedRoutes = [
  '/dashboard',
  '/settings',
  '/novels/submit',
  '/webtoons/submit',
  '/books/submit',
  '/contests/submit',
  '/creations/submit',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth in local dev if Supabase is not configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return addSecurityHeaders(NextResponse.next());
  }

  const needsAuth = protectedRoutes.some(route => pathname.startsWith(route));

  // Create Supabase client with cookie passthrough for session refresh
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  if (needsAuth) {
    // Full server-side user verification (network call) — only for protected routes
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/welcome', request.url));
    }
  } else {
    // Just refresh session cookies locally (no network call) for public routes
    await supabase.auth.getSession();
  }

  return addSecurityHeaders(response);
}

function addSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and API routes
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)',
  ],
};
