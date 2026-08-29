import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { uploadMedia } from "../../lib/supabase";

if (!ffmpegPath) throw new Error("No ffmpeg binary is available for this platform.");
ffmpeg.setFfmpegPath(ffmpegPath);

const FRAME_WIDTH = 1536;
const FRAME_HEIGHT = 1024;

type SceneInput = { imageUrl?: string; motionVideoUrl?: string; duration: number };

function runFfmpeg(configure: (command: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    configure(ffmpeg())
      .save(outputPath)
      .on("end", () => resolve())
      .on("error", (error: Error) => reject(error));
  });
}

async function toNormalizedSegment(inputPath: string, outputPath: string, duration: number, isStillImage: boolean): Promise<void> {
  const filters = [
    `scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${FRAME_WIDTH}:${FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
    "setsar=1",
    "fps=30",
  ].join(",");

  await runFfmpeg((command) => {
    if (isStillImage) command.inputOptions(["-loop", "1"]);
    return command
      .input(inputPath)
      .outputOptions(["-t", String(Math.max(1, duration)), "-vf", filters, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"]);
  }, outputPath);
}

export async function POST(request: Request) {
  let scenes: SceneInput[] = [];
  try {
    const body = await request.json() as { scenes?: SceneInput[] };
    scenes = body.scenes ?? [];
  } catch {
    return Response.json({ error: "The render request could not be read." }, { status: 400 });
  }

  const usableScenes = scenes.filter((scene) => scene.motionVideoUrl || scene.imageUrl);
  if (!usableScenes.length) return Response.json({ error: "Generate at least one frame or clip before exporting." }, { status: 400 });

  const workDir = await mkdtemp(join(tmpdir(), "museflow-"));
  try {
    const segmentPaths: string[] = [];
    for (let index = 0; index < usableScenes.length; index += 1) {
      const scene = usableScenes[index];
      const isStillImage = !scene.motionVideoUrl;
      const sourceUrl = scene.motionVideoUrl ?? scene.imageUrl!;
      const sourceResponse = await fetch(sourceUrl);
      if (!sourceResponse.ok) return Response.json({ error: `Could not download scene ${index + 1}'s media for rendering.` }, { status: 502 });
      const sourceBytes = Buffer.from(await sourceResponse.arrayBuffer());
      const inputPath = join(workDir, `input-${index}${isStillImage ? ".webp" : ".mp4"}`);
      await writeFile(inputPath, sourceBytes);

      const segmentPath = join(workDir, `segment-${index}.mp4`);
      await toNormalizedSegment(inputPath, segmentPath, scene.duration, isStillImage);
      segmentPaths.push(segmentPath);
    }

    const listPath = join(workDir, "list.txt");
    await writeFile(listPath, segmentPaths.map((path) => `file '${path}'`).join("\n"));

    const outputPath = join(workDir, "output.mp4");
    await runFfmpeg((command) => command
      .input(listPath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c", "copy"]), outputPath);

    const outputBytes = await readFile(outputPath);
    const bytes = outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength);
    const videoUrl = await uploadMedia(`renders/${crypto.randomUUID()}.mp4`, bytes, "video/mp4");
    return Response.json({ videoUrl });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Rendering the cut failed." }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
