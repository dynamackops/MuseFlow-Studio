const HIGGSFIELD_API = "https://api.higgsfield.ai";
const MOTION_MODEL_PATH = "/kling-video/v2.5-turbo/standard/image-to-video";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

function parseDataUrl(dataUrl: string): { contentType: string; bytes: ArrayBuffer } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  return { contentType, bytes: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
}

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-provider-key")?.trim();
  if (!apiKey || !apiKey.includes(":")) {
    return Response.json({ error: "Connect a Higgsfield key in the form key_id:key_secret first." }, { status: 401 });
  }

  let imageDataUrl = "";
  let prompt = "";
  try {
    const body = await request.json() as { imageDataUrl?: string; prompt?: string };
    imageDataUrl = body.imageDataUrl ?? "";
    prompt = body.prompt?.trim() ?? "";
  } catch {
    return Response.json({ error: "The motion request could not be read." }, { status: 400 });
  }
  if (!prompt) return Response.json({ error: "Add a motion prompt first." }, { status: 400 });

  const parsed = parseDataUrl(imageDataUrl);
  if (!parsed || !ALLOWED_IMAGE_TYPES.has(parsed.contentType)) {
    return Response.json({ error: "Generate a frame for this scene before animating it." }, { status: 400 });
  }

  const authHeader = { Authorization: `Key ${apiKey}` };

  const uploadUrlResponse = await fetch(`${HIGGSFIELD_API}/files/generate-upload-url`, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: parsed.contentType }),
  });
  const uploadUrlResult = await uploadUrlResponse.json() as {
    public_url?: string; upload_url?: string; upload_headers?: Record<string, string>; detail?: string;
  };
  if (!uploadUrlResponse.ok || !uploadUrlResult.upload_url || !uploadUrlResult.public_url) {
    return Response.json({ error: uploadUrlResult.detail ?? "Higgsfield could not prepare an upload slot." }, { status: uploadUrlResponse.status || 502 });
  }

  const uploadResponse = await fetch(uploadUrlResult.upload_url, {
    method: "PUT",
    headers: uploadUrlResult.upload_headers ?? { "Content-Type": parsed.contentType },
    body: parsed.bytes,
  });
  if (!uploadResponse.ok) {
    return Response.json({ error: "Uploading the frame to Higgsfield failed." }, { status: 502 });
  }

  const generationResponse = await fetch(`${HIGGSFIELD_API}${MOTION_MODEL_PATH}`, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_url: uploadUrlResult.public_url }),
  });
  const generationResult = await generationResponse.json() as {
    request_id?: string; status_url?: string; status?: string; detail?: string;
  };
  if (!generationResponse.ok || !generationResult.request_id || !generationResult.status_url) {
    return Response.json({ error: generationResult.detail ?? "Higgsfield could not start this motion clip." }, { status: generationResponse.status || 502 });
  }

  return Response.json({ requestId: generationResult.request_id, statusUrl: generationResult.status_url, status: generationResult.status ?? "queued" });
}
