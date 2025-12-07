import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

export const convertWebmBase64ToWavBase64 = async (webmBase64: string): Promise<string> => {
    const tmpDir = path.join(__dirname, "..", "..", "tmp");
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);
    const inputPath = path.join(tmpDir, `input-${id}.webm`);
    const outputPath = path.join(tmpDir, `output-${id}.wav`);

    const buffer = Buffer.from(webmBase64, "base64");
    await writeFile(inputPath, buffer);

    await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat("wav")
            .audioCodec("pcm_s16le")
            .audioFrequency(16000)
            .on("end", () => resolve())
            .on("error", (err) => reject(err))
            .save(outputPath);
    });

    const wavBuffer = await readFile(outputPath);

    // Dọn file tạm (best-effort)
    try { await unlink(inputPath); } catch { }
    try { await unlink(outputPath); } catch { }

    return wavBuffer.toString("base64");
};