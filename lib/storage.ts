import { createClient } from "@/lib/supabase/server";

const BUCKET = "meals";

export async function uploadMealPhoto(
  userId: string,
  draftId: string,
  file: Blob,
): Promise<string> {
  const supabase = await createClient();
  const path = `${userId}/${draftId}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function getSignedPhotoUrl(
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) throw error ?? new Error("signed url failed");
  return data.signedUrl;
}

export async function movePhoto(fromPath: string, toPath: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).move(fromPath, toPath);
  if (error) throw error;
}

export async function deletePhoto(path: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
