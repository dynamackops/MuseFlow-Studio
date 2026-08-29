import { uploadMedia } from "../../lib/supabase";

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-provider-key")?.trim();
  if (!apiKey) return Response.json({ error: "Connect an OpenAI API key first." }, { status: 401 });

  let name = "";
  let description = "";
  try {
    const body = await request.json() as { name?: string; description?: string };
    name = body.name?.trim() ?? "";
    description = body.description?.trim() ?? "";
  } catch {
    return Response.json({ error: "The location details could not be read." }, { status: 400 });
  }
  if (!name) return Response.json({ error: "Give this location a name first." }, { status: 400 });
  if (!description) return Response.json({ error: "Describe this location before generating a reference." }, { status: 400 });

  const prompt = `Location reference for a story setting called "${name}": ${description}. Wide establishing shot, no characters present, consistent architecture and color palette, cinematic natural lighting, single environment, no text, no watermark, 16:9`;

  const upstream = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1.5", prompt, size: "1536x1024", quality: "medium", output_format: "webp" }),
  });
  const result = await upstream.json() as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
  if (!upstream.ok) return Response.json({ error: result.error?.message ?? "OpenAI could not generate this location." }, { status: upstream.status });
  const image = result.data?.[0]?.b64_json;
  if (!image) return Response.json({ error: "OpenAI returned no image data." }, { status: 502 });

  const buffer = Buffer.from(image, "base64");
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const referenceImageUrl = await uploadMedia(`locations/${crypto.randomUUID()}.webp`, bytes, "image/webp");
  return Response.json({ referenceImageUrl });
}
