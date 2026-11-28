import { NextResponse } from "next/server";

// Proxies the what-if simulator to the Python prediction API (tubescope.api), so the browser
// never needs to know where it runs and CORS stays closed.
//
// The API runs on a free host that sleeps when idle and can take up to a minute to wake, so
// requests may wait that long. GET is a cheap wake-up call the simulator makes on page load.

export const maxDuration = 60;

const TIMEOUT_MS = 55_000;

function base(): string | null {
  return process.env.PREDICT_API_URL ?? null;
}

export async function GET() {
  const url = base();
  if (!url) return NextResponse.json({ status: "unconfigured" }, { status: 503 });
  try {
    const response = await fetch(new URL("/health", url), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return NextResponse.json({ status: response.ok ? "ok" : "error" }, { status: response.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ status: "unreachable" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const url = base();
  if (!url) {
    return NextResponse.json({ error: "PREDICT_API_URL is not configured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  try {
    const response = await fetch(new URL("/predict", url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: "prediction service unreachable" }, { status: 502 });
  }
}
