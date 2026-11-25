const VERCEL_ORIGIN = "printkurox.unknowniphone724.workers.dev";

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

    const cache = caches.default;
    if (isGetOrHead && (isStaticAsset || isCacheablePublicApi)) {
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
    }

    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set("Host", VERCEL_ORIGIN);
    proxyHeaders.set("X-Forwarded-Host", incomingUrl.host);
    proxyHeaders.delete("cf-connecting-ip");
    proxyHeaders.delete("cf-ipcountry");
    proxyHeaders.delete("cf-ray");
    proxyHeaders.delete("cf-visitor");

    const originReq = new Request(targetUrl.toString(), {
      method: request.method,
      headers: proxyHeaders,
      body: isGetOrHead ? undefined : request.body,
      redirect: "manual",
    });

    const originResponse = env?.NEXT_WORKER
      ? await env.NEXT_WORKER.fetch(originReq)
      : await fetch(originReq);

    const respHeaders = new Headers(originResponse.headers);
    const loc = respHeaders.get("Location");
    if (loc && loc.includes(VERCEL_ORIGIN)) {
      respHeaders.set("Location", loc.replace(`https://${VERCEL_ORIGIN}`, incomingUrl.origin));
    }

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
