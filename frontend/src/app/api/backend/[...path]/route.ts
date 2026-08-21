import { NextRequest } from "next/server";
const backend = process.env.FASTAPI_URL ?? "http://127.0.0.1:8100";
async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const target = new URL(path.join("/"), `${backend}/`);
  target.search = request.nextUrl.search;
  const headers = new Headers(request.headers);
  headers.delete("host");
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.arrayBuffer();
  return fetch(target, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
  });
}
export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
