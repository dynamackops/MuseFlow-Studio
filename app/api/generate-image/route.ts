import { uploadMedia } from "../../lib/supabase";

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-provider-key")?.trim();
  if (!apiKey) return Response.json({ error: "Connect an OpenAI API key first." }, { status: 401 });

  let prompt = "";
  let characterReferenceUrl: string | undefined;
  let locationReferenceUrl: string | undefined;
  try {
    const body = await request.json() as { prompt?: string; characterReferenceUrl?: string; locationReferenceUrl?: string };
    prompt = body.prompt?.trim() ?? "";
    characterReferenceUrl = body.characterReferenceUrl?.trim() || undefined;
    locationReferenceUrl = body.locationReferenceUrl?.trim() || undefined;
  } catch {
    return Response.json({ error: "The image prompt could not be read." }, { status: 400 });
  }
  if (!prompt) return Response.json({ error: "Add an image prompt first." }, { status: 400 });

  // OpenAI's image-edit endpoint accepts one reference image, so a character's
  // face takes priority over a location's when both are attached; the
  // location's look still reaches the model through the text prompt.
  const referenceUrl = characterReferenceUrl ?? locationReferenceUrl;
  const referenceLabel = characterReferenceUrl ? "character" : "location";

  let upstream: Response;
  if (referenceUrl) {
    const referenceResponse = await fetch(referenceUrl);
    if (!referenceResponse.ok) return Response.json({ error: `Could not load this scene's ${referenceLabel} reference.` }, { status: 502 });
    const referenceBlob = await referenceResponse.blob();
    const form = new FormData();
    form.append("model", "gpt-image-1.5");
    form.append("prompt", referenceLabel === "character"
      ? `${prompt}. Match the exact face, body, and wardrobe of the reference character image.`
      : `${prompt}. Match the exact architecture, layout, and color palette of the reference location image.`);
    form.append("size", "1536x1024");
    form.append("quality", "low");
    form.append("image", referenceBlob, "reference.webp");
    upstream = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1.5", prompt, size: "1536x1024", quality: "low", output_format: "webp" }),
    });
  }

  const result = await upstream.json() as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
  if (!upstream.ok) return Response.json({ error: result.error?.message ?? "OpenAI could not generate this frame." }, { status: upstream.status });
  const image = result.data?.[0]?.b64_json;
  if (!image) return Response.json({ error: "OpenAI returned no image data." }, { status: 502 });

  const buffer = Buffer.from(image, "base64");
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const imageUrl = await uploadMedia(`frames/${crypto.randomUUID()}.webp`, bytes, "image/webp");
  return Response.json({ imageUrl });
}
