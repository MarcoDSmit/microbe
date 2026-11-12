const mediaTypes = { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml" };

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/")) return api(request, env.store ?? d1Store(env.DB));
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const file = path === "/" ? "/index.html" : path;
    if (!Object.hasOwn(assets, file)) return new Response("Not found", { status: 404 });
    return new Response(request.method === "HEAD" ? null : assets[file], { headers: {
      "Content-Type": mediaTypes[file.split(".").at(-1)] + "; charset=utf-8",
      "Cache-Control": "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'",
    } });
  },
};
