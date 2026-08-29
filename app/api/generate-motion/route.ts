const HIGGSFIELD_API = "https://api.higgsfield.ai";
const MOTION_MODEL_PATH = "/kling-video/v2.5-turbo/standard/image-to-video";

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-provider-key")?.trim();
  if (!apiKey || !apiKey.includes(":")) {
    return Response.json({ error: "Connect a Higgsfield key in the form key_id:key_secret first." }, { status: 401 });
  }

  let imageUrl = "";
  let prompt = "";
  try {
    const body = await request.json() as { imageUrl?: string; prompt?: string };
    imageUrl = body.imageUrl?.trim() ?? "";
    prompt = body.prompt?.trim() ?? "";
  } catch {
    return Response.json({ error: "The motion request could not be read." }, { status: 400 });
  }
  if (!prompt) return Response.json({ error: "Add a motion prompt first." }, { status: 400 });
  if (!imageUrl) return Response.json({ error: "Generate a frame for this scene before animating it." }, { status: 400 });

  const generationResponse = await fetch(`${HIGGSFIELD_API}${MOTION_MODEL_PATH}`, {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_url: imageUrl }),
  });
  const generationResult = await generationResponse.json() as {
    request_id?: string; status_url?: string; status?: string; detail?: string;
  };
  if (!generationResponse.ok || !generationResult.request_id || !generationResult.status_url) {
    return Response.json({ error: generationResult.detail ?? "Higgsfield could not start this motion clip." }, { status: generationResponse.status || 502 });
  }

  return Response.json({ requestId: generationResult.request_id, statusUrl: generationResult.status_url, status: generationResult.status ?? "queued" });
}
