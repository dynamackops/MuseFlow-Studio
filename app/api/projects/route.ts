import { supabase } from "../../lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, idea, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    projects: data.map((row) => ({ id: row.id, name: row.name, idea: row.idea, updatedAt: row.updated_at })),
  });
}
