import { uploadMedia } from "../../../lib/supabase";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  let fileDataUrl = "";
  try {
    const body = await request.json() as { fileDataUrl?: string };
    fileDataUrl = body.fileDataUrl ?? "";
  } catch {
    return Response.json({ error: "The uploaded file could not be read." }, { status: 400 });
  }

  const match = /^data:([^;]+);base64,(.+)$/.exec(fileDataUrl);
  if (!match || !ALLOWED_IMAGE_TYPES.has(match[1])) {
    return Response.json({ error: "Upload a JPEG, PNG, WebP, or GIF image." }, { status: 400 });
  }
  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const extension = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const referenceImageUrl = await uploadMedia(`characters/${crypto.randomUUID()}.${extension}`, bytes, contentType);
  return Response.json({ referenceImageUrl });
}
