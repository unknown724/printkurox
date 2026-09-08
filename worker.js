export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    url.hostname = "printkurox.vercel.app";
    url.protocol = "https:";

    // Forward the request to Vercel with all headers and methods
    const response = await fetch(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "follow",
    });

    return response;
  }
};
