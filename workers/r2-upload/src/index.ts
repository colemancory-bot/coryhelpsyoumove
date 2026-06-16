// R2 Upload Proxy Worker
// Accepts PUT requests from Supabase Edge Functions and writes to R2.
// Auth: Bearer token must match the UPLOAD_SECRET env var.

interface Env {
  MLS_MEDIA: R2Bucket;
  UPLOAD_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "PUT, DELETE, GET",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    }

    // Auth check
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.UPLOAD_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Extract key from URL path (e.g., /listings/CAR123/0.jpg)
    const url = new URL(request.url);
    const key = url.pathname.slice(1); // remove leading /
    if (!key) {
      return Response.json({ error: "Missing key in path" }, { status: 400 });
    }

    if (request.method === "PUT") {
      const contentType = request.headers.get("Content-Type") || "image/jpeg";
      await env.MLS_MEDIA.put(key, request.body, {
        httpMetadata: { contentType },
      });
      return Response.json({ ok: true, key });
    }

    if (request.method === "DELETE") {
      await env.MLS_MEDIA.delete(key);
      return Response.json({ ok: true, deleted: key });
    }

    // GET: list objects with prefix (for delete-folder)
    if (request.method === "GET") {
      const prefix = url.searchParams.get("prefix") || key;
      const listed = await env.MLS_MEDIA.list({ prefix });
      const keys = listed.objects.map((o) => o.key);
      return Response.json({ keys });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  },
};
