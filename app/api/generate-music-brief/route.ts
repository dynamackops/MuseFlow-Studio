const SYSTEM_PROMPT = `You are MuseFlow's music supervisor. Given a story idea and its scene beats, write a short music brief for a soundtrack, ending with a ready-to-paste prompt for Suno (an AI music generator).

Format the response as plain text with these labeled lines, nothing else:
Genre: ...
Mood: ...
Tempo: ...
Instrumentation: ...
Suno prompt: ...

Keep each line to one sentence except the Suno prompt, which should be a single dense paragraph describing genre, mood, instrumentation, tempo, and structure so it can be pasted directly into Suno.`;

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-provider-key")?.trim();
  if (!apiKey) return Response.json({ error: "Connect an OpenAI API key first." }, { status: 401 });

  let idea = "";
  let beats: string[] = [];
  try {
    const body = await request.json() as { idea?: string; beats?: string[] };
    idea = body.idea?.trim() ?? "";
    beats = body.beats ?? [];
  } catch {
    return Response.json({ error: "The music brief request could not be read." }, { status: 400 });
  }
  if (!idea) return Response.json({ error: "Add a story idea first." }, { status: 400 });

  const userContent = beats.length ? `Story idea: ${idea}\n\nScene beats:\n${beats.map((beat, index) => `${index + 1}. ${beat}`).join("\n")}` : `Story idea: ${idea}`;

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });
  const result = await upstream.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!upstream.ok) return Response.json({ error: result.error?.message ?? "OpenAI could not write a music brief." }, { status: upstream.status });

  const brief = result.choices?.[0]?.message?.content?.trim();
  if (!brief) return Response.json({ error: "OpenAI returned no music brief." }, { status: 502 });

  return Response.json({ brief });
}
