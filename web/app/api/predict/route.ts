import { NextResponse } from "next/server";

// Proxies the what-if simulator to the Python prediction API (tubescope.api), so the browser
// never needs to know where it runs and CORS stays closed.
export async function POST(request: Request) {
  const base = process.env.PREDICT_API_URL;
  if (!base) {
    return NextResponse.json({ error: "PREDICT_API_URL is not configured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  try {
    const response = await fetch(new URL("/predict", base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: "prediction service unreachable" }, { status: 502 });
  }
}
