import OpenAI from "openai";
import { getRequestUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/transcribe
 *
 * Multipart form with `audio` File. Forwards to OpenAI Whisper and returns
 * `{ transcript: string }`. Returns 503 `{ error: "whisper disabled" }` when
 * `OPENAI_API_KEY` is unset (graceful degrade — the analyze route will fall
 * back to the typed transcript path).
 */
export async function POST(req: Request): Promise<Response> {
  try {
    // Auth check — only signed-in users can transcribe (cookie or Bearer token).
    const user = await getRequestUser(req);
    if (!user) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "whisper disabled" }, { status: 503 });
    }

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      return Response.json({ error: "no audio" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const tr = await openai.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
    });

    return Response.json({ transcript: tr.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "transcription failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
