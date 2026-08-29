const ALLOWED_HOST = "api.higgsfield.ai";

export async function GET(request: Request) {
  const apiKey = request.headers.get("x-provider-key")?.trim();
  if (!apiKey || !apiKey.includes(":")) {
    return Response.json({ error: "Connect a Higgsfield key in the form key_id:key_secret first." }, { status: 401 });
  }

  const statusUrl = new URL(request.url).searchParams.get("statusUrl") ?? "";
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(statusUrl);
  } catch {
    return Response.json({ error: "Missing or invalid status URL." }, { status: 400 });
  }
  if (parsedUrl.hostname !== ALLOWED_HOST) {
    return Response.json({ error: "Refusing to poll an untrusted host." }, { status: 400 });
  }

  const upstream = await fetch(parsedUrl.toString(), { headers: { Authorization: `Key ${apiKey}` } });
  const result = await upstream.json() as {
    status?: string; video?: { url?: string }; error?: unknown; detail?: string;
  };
  if (!upstream.ok) {
    return Response.json({ error: result.detail ?? "Higgsfield could not report this request's status." }, { status: upstream.status });
  }

  return Response.json({
    status: result.status ?? "unknown",
    videoUrl: result.video?.url,
    error: typeof result.error === "string" ? result.error : undefined,
  });
}
