import { supabase } from "../../lib/supabase";

type ClientScene = {
  id: number; title: string; beat: string; duration: number; shot: string;
  imagePrompt: string; motionPrompt: string; imageReady: boolean; motionReady: boolean;
  imageUrl?: string; motionVideoUrl?: string; characterIds?: string[]; locationId?: string;
};

type SceneRow = {
  position: number; title: string; beat: string; duration: number; shot: string;
  image_prompt: string; motion_prompt: string; image_url: string | null; motion_video_url: string | null;
  image_ready: boolean; motion_ready: boolean; character_ids: string[] | null; location_id: string | null;
};

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing project id." }, { status: 400 });

  const { data: project, error: projectError } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  if (!project) return Response.json({ project: null });

  const { data: sceneRows, error: sceneError } = await supabase
    .from("scenes").select("*").eq("project_id", id).order("position", { ascending: true });
  if (sceneError) return Response.json({ error: sceneError.message }, { status: 500 });

  const scenes: ClientScene[] = (sceneRows as SceneRow[]).map((row, index) => ({
    id: index + 1,
    title: row.title,
    beat: row.beat,
    duration: row.duration,
    shot: row.shot,
    imagePrompt: row.image_prompt,
    motionPrompt: row.motion_prompt,
    imageReady: row.image_ready,
    motionReady: row.motion_ready,
    imageUrl: row.image_url ?? undefined,
    motionVideoUrl: row.motion_video_url ?? undefined,
    characterIds: row.character_ids ?? [],
    locationId: row.location_id ?? undefined,
  }));

  return Response.json({
    project: {
      id: project.id, name: project.name, idea: project.idea,
      leadCharacterIds: project.lead_character_ids ?? [],
      locationIds: project.location_ids ?? [],
      musicBrief: project.music_brief ?? "",
    },
    scenes,
  });
}

export async function POST(request: Request) {
  let body: { id?: string; name?: string; idea?: string; scenes?: ClientScene[]; leadCharacterIds?: string[]; locationIds?: string[]; musicBrief?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The project payload could not be read." }, { status: 400 });
  }
  const { id, name, idea, scenes, leadCharacterIds, locationIds, musicBrief } = body;
  if (!name || !scenes) return Response.json({ error: "A project name and scenes are required." }, { status: 400 });

  const record = { name, idea, lead_character_ids: leadCharacterIds ?? [], location_ids: locationIds ?? [], music_brief: musicBrief ?? "" };
  const { data: project, error: upsertError } = id
    ? await supabase.from("projects").update({ ...record, updated_at: new Date().toISOString() }).eq("id", id).select().single()
    : await supabase.from("projects").insert(record).select().single();
  if (upsertError) return Response.json({ error: upsertError.message }, { status: 500 });

  const projectId = project.id as string;
  const { error: deleteError } = await supabase.from("scenes").delete().eq("project_id", projectId);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

  const rows = scenes.map((scene, index) => ({
    project_id: projectId,
    position: index,
    title: scene.title,
    beat: scene.beat,
    duration: scene.duration,
    shot: scene.shot,
    image_prompt: scene.imagePrompt,
    motion_prompt: scene.motionPrompt,
    image_url: scene.imageUrl ?? null,
    motion_video_url: scene.motionVideoUrl ?? null,
    image_ready: scene.imageReady,
    motion_ready: scene.motionReady,
    character_ids: scene.characterIds ?? [],
    location_id: scene.locationId ?? null,
  }));
  if (rows.length) {
    const { error: insertError } = await supabase.from("scenes").insert(rows);
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
  }

  return Response.json({ id: projectId });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing project id." }, { status: 400 });
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
