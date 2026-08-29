export async function POST(request: Request) {
  const apiKey = request.headers.get("x-provider-key")?.trim();
  if (!apiKey) return Response.json({ error: "Connect an OpenAI API key first." }, { status: 401 });

  let prompt = "";
  try {
    const body = await request.json() as { prompt?: string };
    prompt = body.prompt?.trim() ?? "";
  } catch {
    return Response.json({ error: "The image prompt could not be read." }, { status: 400 });
  }
  if (!prompt) return Response.json({ error: "Add an image prompt first." }, { status: 400 });

  const upstream = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1.5", prompt, size: "1536x1024", quality: "low", output_format: "webp" }),
  });
  const result = await upstream.json() as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
  if (!upstream.ok) return Response.json({ error: result.error?.message ?? "OpenAI could not generate this frame." }, { status: upstream.status });
  const image = result.data?.[0]?.b64_json;
  if (!image) return Response.json({ error: "OpenAI returned no image data." }, { status: 502 });
  return Response.json({ imageDataUrl: `data:image/webp;base64,${image}` });
}
