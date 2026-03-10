import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";

const REQUEST_TIMEOUT_MS = 20000;

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const isPrivateIpv4Address = (host: string) => {
  if (!IPV4_PATTERN.test(host)) {
    return false;
  }

  const octets = host.split(".").map((value) => Number.parseInt(value, 10));
  if (octets.some((octet) => !Number.isFinite(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [first, second] = octets;

  if (first === 10) {
    return true;
  }
  if (first === 127) {
    return true;
  }
  if (first === 169 && second === 254) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  if (first === 0) {
    return true;
  }

  return false;
};

const isBlockedHost = (host: string) => {
  const normalized = host.toLowerCase();

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "::1"
  ) {
    return true;
  }

  return isPrivateIpv4Address(normalized);
};

const sanitizeFileName = (name: string, contentType: string) => {
  const stripped = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const hasExtension = /\.[a-zA-Z0-9]{2,6}$/.test(stripped);

  if (hasExtension) {
    return stripped;
  }

  const inferredExt = contentType.split("/")[1]?.split(";")[0]?.toLowerCase() || "png";
  const base = stripped || "image";

  return `${base}.${inferredExt}`;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const src = request.nextUrl.searchParams.get("src");
  const requestedName = request.nextUrl.searchParams.get("name") || "image";

  if (!src) {
    return NextResponse.json({ error: "Missing src query parameter." }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(src);
  } catch {
    return NextResponse.json({ error: "Invalid src URL." }, { status: 400 });
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) URLs are supported." }, { status: 400 });
  }

  if (parsedUrl.username || parsedUrl.password || isBlockedHost(parsedUrl.hostname)) {
    return NextResponse.json({ error: "Blocked target host." }, { status: 400 });
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(parsedUrl.toString(), {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: abortController.signal,
      headers: {
        Accept: "image/*,*/*;q=0.8",
      },
    });
  } catch {
    clearTimeout(timeoutId);
    return NextResponse.json(
      { error: "Unable to reach upstream image provider." },
      { status: 502 }
    );
  }

  clearTimeout(timeoutId);

  if (!upstreamResponse.ok) {
    return NextResponse.json(
      { error: `Upstream provider returned ${upstreamResponse.status}.` },
      { status: 502 }
    );
  }

  const contentType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "Upstream response is not an image." }, { status: 415 });
  }

  const fileName = sanitizeFileName(requestedName, contentType);
  const body = await upstreamResponse.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename=\"${fileName}\"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
