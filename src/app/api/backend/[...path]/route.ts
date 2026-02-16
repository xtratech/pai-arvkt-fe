import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = (process.env.BACKEND_BASE_URL ?? "").replace(
  /\/+$/,
  "",
);
const BACKEND_API_KEY = process.env.BACKEND_API_KEY ?? "";

const FORWARDED_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "accept-language",
];

function buildTargetUrl(path: string, search: string) {
  if (!BACKEND_BASE_URL) {
    throw new Error("BACKEND_BASE_URL is not configured.");
  }
  const cleanPath = path.replace(/^\/+/, "");
  const url = `${BACKEND_BASE_URL}/${cleanPath}`;
  return search ? `${url}${search}` : url;
}

function pickHeaders(req: NextRequest) {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers.get(name);
    if (value) {
      headers[name] = value;
    }
  }
  if (BACKEND_API_KEY) {
    headers["x-api-key"] = BACKEND_API_KEY;
  }
  return headers;
}

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const joinedPath = path.join("/");

  let targetUrl: string;
  try {
    targetUrl = buildTargetUrl(joinedPath, req.nextUrl.search);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }

  const headers = pickHeaders(req);

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  const passthroughHeaders = [
    "content-type",
    "cache-control",
    "x-amzn-requestid",
  ];
  for (const name of passthroughHeaders) {
    const value = upstream.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  }

  const responseBody = await upstream.arrayBuffer();
  return new NextResponse(responseBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
