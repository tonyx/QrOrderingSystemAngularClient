interface Env {
  BACKEND_ORIGIN?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const shouldProxy =
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/hubs') ||
    url.pathname.startsWith('/Account') ||
    url.pathname.startsWith('/signin-google') ||
    url.pathname.startsWith('/signin-facebook');

  if (shouldProxy) {
    const backendOrigin = env.BACKEND_ORIGIN || 'https://www.restaurantsystem.cloud';
    const targetUrl = new URL(url.pathname + url.search, backendOrigin);

    const modifiedHeaders = new Headers(request.headers);
    modifiedHeaders.set('X-Forwarded-Host', url.hostname);
    modifiedHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: modifiedHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'manual',
    });

    try {
      const response = await fetch(proxyRequest);
      return response;
    } catch (err: any) {
      return new Response(JSON.stringify({ error: 'Proxy Error', details: err?.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return context.next();
};
