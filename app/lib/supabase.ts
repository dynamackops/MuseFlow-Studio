import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://nkysggbnudwvrmlhushm.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_R-LM9dMn3a24Tm7cdbP0LA_lgZ27GdT";
const MEDIA_BUCKET = "museflow-media";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

export async function uploadMedia(path: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
