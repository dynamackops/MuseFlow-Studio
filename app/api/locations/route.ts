import { supabase } from "../../lib/supabase";

export async function GET() {
  const { data, error } = await supabase.from("locations").select("*").order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    locations: data.map((row) => ({
      id: row.id, name: row.name, description: row.description, referenceImageUrl: row.reference_image_url ?? undefined,
    })),
  });
}

export async function POST(request: Request) {
  let body: { id?: string; name?: string; description?: string; referenceImageUrl?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The location payload could not be read." }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "Give this location a name first." }, { status: 400 });

  const record = { name, description: body.description?.trim() ?? "", reference_image_url: body.referenceImageUrl ?? null, updated_at: new Date().toISOString() };
  const { data, error } = body.id
    ? await supabase.from("locations").update(record).eq("id", body.id).select().single()
    : await supabase.from("locations").insert(record).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ id: data.id, name: data.name, description: data.description, referenceImageUrl: data.reference_image_url ?? undefined });
}
