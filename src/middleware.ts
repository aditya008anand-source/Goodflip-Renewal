import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_ONLY_PREFIXES = ['/revenue', '/settings'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user: authedUser },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith('/login');

  // 24-hour auto-logout: mysaathi_login_at is set by the login page at
  // sign-in time. Only a session whose cookie is actually present AND older
  // than 24h is treated as logged out here — a session with NO cookie yet
  // (e.g. one that started before this feature existed) is grandfathered in
  // and just gets the cookie stamped below, rather than being force-logged-
  // out immediately. Forcing it unconditionally caused a redirect loop the
  // first time this shipped: it fought with the normal !user→/login and
  // user+isAuthRoute→/overview rules below every single request.
  const loginAtCookie = request.cookies.get('mysaathi_login_at')?.value;
  const dayMs = 24 * 60 * 60 * 1000;
  const sessionExpired = !!loginAtCookie && Date.now() - Number(loginAtCookie) > dayMs;
  const user = sessionExpired ? null : authedUser;

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    if (sessionExpired) {
      request.cookies.getAll().forEach((c) => {
        if (c.name.startsWith('sb-')) redirectResponse.cookies.delete(c.name);
      });
      redirectResponse.cookies.delete('mysaathi_login_at');
    }
    return redirectResponse;
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/overview';
    return NextResponse.redirect(url);
  }

  // Grandfather an existing session that predates this feature: stamp the
  // cookie now instead of logging it out, so the 24h clock starts from here.
  if (user && !isAuthRoute && !loginAtCookie) {
    response.cookies.set('mysaathi_login_at', String(Date.now()), {
      path: '/',
      maxAge: 60 * 60 * 24,
    });
  }

  // Role gate for admin-only sections. Role lives in public.users, keyed by
  // auth user id — this is a UX redirect only; the real enforcement is the
  // RLS policy on each table (a coach's queries return no rows regardless).
  if (user && ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/overview';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/sync-sheet).*)'],
};
