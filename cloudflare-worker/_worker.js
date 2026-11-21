// e621AutoViewer download proxy - Cloudflare Worker
//
// e621/e926 image servers don't send CORS headers, so the browser can't fetch
// images directly for the download button. This Worker fetches the image and
// returns it with CORS + "save as" headers.
// Only e621/e926 static file hosts are allowed, and only requests from the
// origins below, so the Worker can't be abused as a general open proxy.

const ALLOWED_ORIGINS = [
    "https://e621autoviewer.leithey.com",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
];

// Hostnames the Worker is allowed to fetch from (exact match or subdomain)
const ALLOWED_HOST_SUFFIXES = ["e621.net", "e926.net"];

const USER_AGENT = "e621AutoViewer/1.0 (by Leithey)";

function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Expose-Headers": "Content-Disposition, Content-Length, Content-Type",
        "Vary": "Origin",
    };
}

function isAllowedHost(hostname) {
    return ALLOWED_HOST_SUFFIXES.some(s => hostname === s || hostname.endsWith("." + s));
}

function errorResponse(status, message, origin) {
    return new Response(JSON.stringify({ success: false, status, message }), {
        status,
        headers: { "Content-Type": "application/json", ...(origin ? corsHeaders(origin) : {}) },
    });
}

export default {
    async fetch(request) {
        const origin = request.headers.get("Origin");
        const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : null;

        if (!allowedOrigin) {
            return errorResponse(403, "Origin not allowed", null);
        }

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
        }

        if (request.method !== "GET") {
            return errorResponse(405, "Method not allowed", allowedOrigin);
        }

        const target = new URL(request.url).searchParams.get("url");
        if (!target) {
            return errorResponse(400, "Missing ?url= parameter", allowedOrigin);
        }

        let targetUrl;
        try {
            targetUrl = new URL(target);
        } catch {
            return errorResponse(400, "Invalid url", allowedOrigin);
        }

        if (targetUrl.protocol !== "https:" || !isAllowedHost(targetUrl.hostname)) {
            return errorResponse(403, "Only e621/e926 file URLs are allowed", allowedOrigin);
        }

        const upstream = await fetch(targetUrl.toString(), {
            headers: { "User-Agent": USER_AGENT },
            cf: { cacheEverything: true, cacheTtl: 86400 },
        });

        if (!upstream.ok) {
            return errorResponse(upstream.status, `Upstream returned ${upstream.status}`, allowedOrigin);
        }

        const filename = targetUrl.pathname.split("/").pop() || "image";
        const headers = new Headers(corsHeaders(allowedOrigin));
        headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/octet-stream");
        const length = upstream.headers.get("Content-Length");
        if (length) headers.set("Content-Length", length);
        headers.set("Content-Disposition", `attachment; filename="${filename}"`);
        headers.set("Cache-Control", "public, max-age=86400");

        // Stream the body through instead of buffering it, so large files work fine
        return new Response(upstream.body, { status: 200, headers });
    },
};
