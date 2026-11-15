const mediaTypes = { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml" };

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/")) return api(request, env.store ?? d1Store(env.DB));
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const file = path === "/" ? "/index.html" : path;
    const encodedImage = images[file];
    if (!Object.hasOwn(assets, file) && !Object.hasOwn(images, file)) return new Response("Not found", { status: 404 });
    const body = request.method === "HEAD" ? null : encodedImage ? Uint8Array.from(atob(encodedImage), c => c.charCodeAt(0)) : assets[file];
    return new Response(body, { headers: {
      "Content-Type": encodedImage ? "image/webp" : mediaTypes[file.split(".").at(-1)] + "; charset=utf-8",
      "Cache-Control": "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'",
    } });
  },
};
