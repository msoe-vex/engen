import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function coreBase() {
  return (process.env.NEXT_PUBLIC_CORE_API_URL || "http://localhost:8080").replace(/\/$/, "");
}

/**
 * Proxy `/public/o/:slug/assets/:assetId` directly to Core.
 * This ensures that when the browser requests public org logos/photos from the website origin,
 * they are streamed from Core without 404s.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; assetId: string }> }
) {
  const { slug, assetId } = await context.params;
  const upstream = `${coreBase()}/public/o/${encodeURIComponent(slug)}/assets/${encodeURIComponent(assetId)}`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      cache: "force-cache",
    });
  } catch {
    return NextResponse.json(
      { error: "Cannot reach Core API to load the public asset." },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    });
  }

  const contentType = res.headers.get("Content-Type") || "application/octet-stream";
  const cacheControl =
    res.headers.get("Cache-Control") || "public, max-age=86400, stale-while-revalidate=604800";

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
}
