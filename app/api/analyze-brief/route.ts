import JSZip from "jszip";

const ALLOWED_TEXT_TYPES = new Set(["text/plain", "text/markdown"]);
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_CHARS = 24000;

const SYSTEM_PROMPT = `You are MuseFlow's story editor. A filmmaker has uploaded raw material for the film they're building — this could be loose notes, a script, or a detailed shot-by-shot prompt book. Read it and extract three things:

1. "idea": a 2-4 sentence synthesis of the story's premise and emotional arc, written as a story pitch — not a scene list or shot list. This will seed a scene-mapping pass, so capture the throughline, not individual shots.
2. "characters": every named recurring character actually described in the material, each with a short visual/personality description (skin tone, hair, wardrobe, presence) drawn directly from the text.
3. "locations": every named recurring location actually described in the material, each with a short visual description drawn directly from the text.

Only include a character or location if the material actually names and describes it — never invent one, and never guess at details the text doesn't give you. If none are clearly described, return an empty array for that field.`;

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    idea: { type: "string" },
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, description: { type: "string" } },
        required: ["name", "description"],
        additionalProperties: false,
      },
    },
    locations: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, description: { type: "string" } },
        required: ["name", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["idea", "characters", "locations"],
  additionalProperties: false,
};

type BriefResult = { idea: string; characters: Array<{ name: string; description: string }>; locations: Array<{ name: string; description: string }> };

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  const matches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
  return decodeXmlEntities(matches.map((tag) => tag.replace(/<[^>]+>/g, "")).join(" "));
}

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-provider-key")?.trim();
  if (!apiKey) return Response.json({ error: "Connect an OpenAI API key first." }, { status: 401 });

  let fileDataUrl = "";
  try {
    const body = await request.json() as { fileDataUrl?: string };
    fileDataUrl = body.fileDataUrl ?? "";
  } catch {
    return Response.json({ error: "The uploaded file could not be read." }, { status: 400 });
  }

  const match = /^data:([^;]+);base64,(.+)$/.exec(fileDataUrl);
  if (!match) return Response.json({ error: "Upload a .txt, .md, or .docx file." }, { status: 400 });
  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");

  let text = "";
  if (contentType === DOCX_TYPE) {
    try {
      text = await extractDocxText(buffer);
    } catch {
      return Response.json({ error: "Could not read this .docx file." }, { status: 400 });
    }
  } else if (ALLOWED_TEXT_TYPES.has(contentType)) {
    text = buffer.toString("utf-8");
  } else {
    return Response.json({ error: "Upload a .txt, .md, or .docx file." }, { status: 400 });
  }

  text = text.trim();
  if (!text) return Response.json({ error: "This file doesn't seem to have any text in it." }, { status: 400 });
  text = text.slice(0, MAX_CHARS);

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      response_format: { type: "json_schema", json_schema: { name: "story_brief", strict: true, schema: BRIEF_SCHEMA } },
    }),
  });
  const result = await upstream.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!upstream.ok) return Response.json({ error: result.error?.message ?? "OpenAI could not read this document." }, { status: upstream.status });

  const raw = result.choices?.[0]?.message?.content;
  if (!raw) return Response.json({ error: "OpenAI returned nothing for this document." }, { status: 502 });

  let parsed: BriefResult;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json({ error: "OpenAI's response could not be parsed." }, { status: 502 });
  }
  if (!parsed.idea?.trim()) return Response.json({ error: "Could not find a story idea in this document." }, { status: 502 });

  return Response.json({ idea: parsed.idea, characters: parsed.characters ?? [], locations: parsed.locations ?? [] });
}
