const VERCEL_ORIGIN = "printkurox.vercel.app";

export default {
  async fetch(request, env, ctx) {
    const incomingUrl = new URL(request.url);
    const targetUrl = new URL(request.url);
    targetUrl.hostname = VERCEL_ORIGIN;
    targetUrl.protocol = "https:";

    const isGetOrHead = request.method === "GET" || request.method === "HEAD";
    const path = incomingUrl.pathname;

    const isStaticAsset =
      path.startsWith("/_next/static/") ||
      path.startsWith("/_next/image") ||
      /\.(?:svg|png|jpg|jpeg|webp|ico|woff|woff2|css|js)$/i.test(path);

    const isCacheablePublicApi =
      (path === "/api/printer-status" ||
        path === "/api/station-pricing" ||
        path === "/api/settings" ||
        path === "/api/version" ||
        (path === "/api/station/list" && incomingUrl.searchParams.get("all") !== "true"));

    // 1. Check Cloudflare Edge Cache first (reduces Vercel CDN consumption + instant 10ms hostel loads)
    const cache = caches.default;
    if (isGetOrHead && (isStaticAsset || isCacheablePublicApi)) {
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
    }

    // 2. Forward to Vercel with proper Host header
    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set("Host", VERCEL_ORIGIN);
    proxyHeaders.set("X-Forwarded-Host", incomingUrl.host);
    proxyHeaders.delete("cf-connecting-ip");
    proxyHeaders.delete("cf-ipcountry");
    proxyHeaders.delete("cf-ray");
    proxyHeaders.delete("cf-visitor");

    const originResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: proxyHeaders,
      body: isGetOrHead ? undefined : request.body,
      redirect: "manual",
    });

    const respHeaders = new Headers(originResponse.headers);
    // Keep redirects inside workers.dev domain
    const loc = respHeaders.get("Location");
    if (loc && loc.includes(VERCEL_ORIGIN)) {
      respHeaders.set("Location", loc.replace(`https://${VERCEL_ORIGIN}`, incomingUrl.origin));
    }

    // Strip restrictive no-cache from Next.js for static assets / public GETs
    if (isGetOrHead && isStaticAsset && originResponse.status === 200) {
      respHeaders.set("Cache-Control", "public, max-age=2592000, s-maxage=2592000, immutable");
    }

    const finalResponse = new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: respHeaders,
    });

    if (isGetOrHead && originResponse.status === 200 && (isStaticAsset || isCacheablePublicApi)) {
      ctx.waitUntil(cache.put(request, finalResponse.clone()));
    }

    return finalResponse;
  },
};
