const SYSTEM_PROMPT = `You are MuseFlow's story editor. You break a raw story idea into a short, emotionally coherent sequence of cinematic scenes for a poetic, low-stimulation animated short film.

Rules:
- 3 to 6 scenes, each carrying exactly one emotional beat and one visual job.
- The final scene should resolve or transform the opening image.
- "duration" is seconds of screen time, an integer between 4 and 8.
- "shot" is a short camera direction like "Slow dolly in · wide" or "Push in · close-up".
- "imagePrompt" describes one cinematic still: consistent lead character design across every scene, midnight indigo and celestial gold palette, restrained magical realism, soft volumetric light, 16:9. Do not invent a different character per scene.
- "motionPrompt" describes how to animate that still: one motivated camera move, one clear emotional action, explicit instruction to preserve the character's face, wardrobe, and composition.
- When named characters are provided, every scene must feature them by name and by their exact given description, verbatim, inside "imagePrompt" — never substitute a different appearance or a generic description.
- When named locations are provided, set every scene in one of them and describe that location by its exact given description, verbatim, inside "imagePrompt".`;

const SCENE_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          beat: { type: "string" },
          duration: { type: "integer", minimum: 4, maximum: 8 },
          shot: { type: "string" },
          imagePrompt: { type: "string" },
          motionPrompt: { type: "string" },
        },
        required: ["title", "beat", "duration", "shot", "imagePrompt", "motionPrompt"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
};

type GeneratedScene = { title: string; beat: string; duration: number; shot: string; imagePrompt: string; motionPrompt: string };

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-provider-key")?.trim();
  if (!apiKey) return Response.json({ error: "Connect an OpenAI API key first." }, { status: 401 });

  let idea = "";
  let characters: Array<{ name: string; description: string }> = [];
  let locations: Array<{ name: string; description: string }> = [];
  try {
    const body = await request.json() as { idea?: string; characters?: Array<{ name: string; description: string }>; locations?: Array<{ name: string; description: string }> };
    idea = body.idea?.trim() ?? "";
    characters = body.characters ?? [];
    locations = body.locations ?? [];
  } catch {
    return Response.json({ error: "The story idea could not be read." }, { status: 400 });
  }
  if (!idea) return Response.json({ error: "Add a story idea first." }, { status: 400 });

  const castNote = characters.length
    ? `\n\nCast to use (name — description, verbatim in every imagePrompt):\n${characters.map((c) => `- ${c.name} — ${c.description}`).join("\n")}`
    : "";
  const locationNote = locations.length
    ? `\n\nLocations to use (name — description, verbatim in every imagePrompt):\n${locations.map((l) => `- ${l.name} — ${l.description}`).join("\n")}`
    : "";

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + castNote + locationNote },
        { role: "user", content: idea },
      ],
      response_format: { type: "json_schema", json_schema: { name: "scene_map", strict: true, schema: SCENE_SCHEMA } },
    }),
  });
  const result = await upstream.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!upstream.ok) return Response.json({ error: result.error?.message ?? "OpenAI could not map this story." }, { status: upstream.status });

  const raw = result.choices?.[0]?.message?.content;
  if (!raw) return Response.json({ error: "OpenAI returned no scene map." }, { status: 502 });

  let parsed: { scenes?: GeneratedScene[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json({ error: "OpenAI's scene map could not be parsed." }, { status: 502 });
  }
  if (!parsed.scenes?.length) return Response.json({ error: "OpenAI returned an empty scene map." }, { status: 502 });

  return Response.json({ scenes: parsed.scenes });
}
