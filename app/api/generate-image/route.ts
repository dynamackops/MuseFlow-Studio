import { uploadMedia } from "../../lib/supabase";

type ReferenceImage = { url: string; name: string; description: string; kind: "character" | "location" };

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-provider-key")?.trim();
  if (!apiKey) return Response.json({ error: "Connect an OpenAI API key first." }, { status: 401 });

  let prompt = "";
  let referenceImages: ReferenceImage[] = [];
  try {
    const body = await request.json() as { prompt?: string; referenceImages?: ReferenceImage[] };
    prompt = body.prompt?.trim() ?? "";
    referenceImages = (body.referenceImages ?? []).filter((entry) => entry.url).slice(0, 16);
  } catch {
    return Response.json({ error: "The image prompt could not be read." }, { status: 400 });
  }
  if (!prompt) return Response.json({ error: "Add an image prompt first." }, { status: 400 });

  let upstream: Response;
  if (referenceImages.length) {
    // Every attached character/location photo is sent as its own reference
    // image (OpenAI's edit endpoint accepts up to 16), each called out by
    // number in the prompt so a multi-character scene locks every face
    // instead of only the one photo a single-image call would have to pick.
    const referenceNotes = referenceImages
      .map((entry, index) => `Reference image ${index + 1} is ${entry.kind === "character" ? "the character" : "the location"} "${entry.name}" (${entry.description}) — match it exactly.`)
      .join(" ");
    const fullPrompt = `${prompt} ${referenceNotes}`;

    const form = new FormData();
    form.append("model", "gpt-image-1.5");
    form.append("prompt", fullPrompt);
    form.append("size", "1536x1024");
    form.append("quality", "low");
    form.append("input_fidelity", "high");
    for (const [index, entry] of referenceImages.entries()) {
      const referenceResponse = await fetch(entry.url);
      if (!referenceResponse.ok) return Response.json({ error: `Could not load the reference photo for "${entry.name}".` }, { status: 502 });
      const referenceBlob = await referenceResponse.blob();
      form.append("image[]", referenceBlob, `reference-${index}.webp`);
    }
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
