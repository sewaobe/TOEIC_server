import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import axios from "axios";
import path from "path";
import fs from "fs";
import FormData from "form-data";
import { v2 as cloudinary } from "cloudinary";

const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION;

if (!AZURE_KEY || !AZURE_REGION) {
  console.warn(
    "[AzureSpeech] Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION in environment. Service will fail at runtime."
  );
}

const STATIC_DIR = path.resolve(__dirname, "../../static");
if (!fs.existsSync(STATIC_DIR)) {
  fs.mkdirSync(STATIC_DIR, { recursive: true });
}

// Voice mapping theo CEFR level (giống Flask cũ)
const VOICE_SETTINGS: Record<
  string,
  { voice: string; rate: string; pitch: string }
> = {
  A1: { voice: "en-US-JennyNeural", rate: "-10%", pitch: "+3Hz" },
  A2: { voice: "en-US-JennyNeural", rate: "-5%", pitch: "+2Hz" },
  B1: { voice: "en-US-GuyNeural", rate: "+0%", pitch: "+0Hz" },
  B2: { voice: "en-GB-SoniaNeural", rate: "+5%", pitch: "+1Hz" },
  C1: { voice: "en-AU-NatashaNeural", rate: "+10%", pitch: "+1Hz" },
  C2: { voice: "en-IN-NeerjaNeural", rate: "+15%", pitch: "+0Hz" },
};

function getVoiceSettings(level: string) {
  return (
    VOICE_SETTINGS[level.toUpperCase()] || {
      voice: "en-US-GuyNeural",
      rate: "+0%",
      pitch: "+0Hz",
    }
  );
}

// ==================== TTS ====================
export async function synthesizeToFile(
  text: string,
  level: string
): Promise<string> {
  if (!AZURE_KEY || !AZURE_REGION) {
    throw new Error("Azure Speech credentials not configured");
  }

  const settings = getVoiceSettings(level);
  const safeName = text
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .substring(0, 20)
    .replace(/^_+|_+$/g, "");
  const filename = `tts_${safeName}_${Date.now()}.mp3`;
  const outPath = path.join(STATIC_DIR, filename);

  const speechConfig = sdk.SpeechConfig.fromSubscription(
    AZURE_KEY,
    AZURE_REGION
  );
  speechConfig.speechSynthesisVoiceName = settings.voice;

  // Build SSML với rate và pitch
  const ssml = `
<speak version='1.0' xml:lang='en-US'>
  <voice name='${settings.voice}'>
    <prosody rate='${settings.rate}' pitch='${settings.pitch}'>
      ${escapeXml(text)}
    </prosody>
  </voice>
</speak>`.trim();

  const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outPath);
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

  return new Promise<string>((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          console.log(`[AzureTTS] Synthesized: ${filename}`);
          resolve(filename); // trả basename
        } else {
          const err = `TTS failed: ${result.errorDetails}`;
          console.error(`[AzureTTS] ${err}`);
          reject(new Error(err));
        }
      },
      (err) => {
        synthesizer.close();
        console.error(`[AzureTTS] Error:`, err);
        reject(err);
      }
    );
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ==================== STT (Batch Transcription) ====================
interface TranscriptionResult {
  transcript: string;
  highlightTimings: Array<{ text: string; startTime: number; endTime: number }>;
}

export async function transcribeAudioUrl(
  audioUrl: string
): Promise<TranscriptionResult> {
  if (!AZURE_KEY || !AZURE_REGION) {
    throw new Error("Azure Speech credentials not configured");
  }

  // 1. Tạo transcription job
  const transcriptionUrl = `https://${AZURE_REGION}.api.cognitive.microsoft.com/speechtotext/v3.1/transcriptions`;

  const payload = {
    contentUrls: [audioUrl],
    locale: "en-US",
    displayName: `Transcription_${Date.now()}`,
    properties: {
      wordLevelTimestampsEnabled: true,
      punctuationMode: "DictatedAndAutomatic",
      profanityFilterMode: "None",
    },
  };

  console.log(`[AzureSTT] Creating transcription for: ${audioUrl}`);

  const createRes = await axios.post(transcriptionUrl, payload, {
    headers: {
      "Ocp-Apim-Subscription-Key": AZURE_KEY,
      "Content-Type": "application/json",
    },
  });

  const jobUrl = createRes.data.self;
  console.log(`[AzureSTT] Job created: ${jobUrl}`);

  // 2. Poll until succeeded
  let status = "NotStarted";
  let filesUrl: string | null = null;

  while (status !== "Succeeded" && status !== "Failed") {
    await new Promise((r) => setTimeout(r, 2000));

    const statusRes = await axios.get(jobUrl, {
      headers: { "Ocp-Apim-Subscription-Key": AZURE_KEY },
    });

    status = statusRes.data.status;
    console.log(`[AzureSTT] Job status: ${status}`);

    if (status === "Succeeded") {
      filesUrl = statusRes.data.links.files;
    } else if (status === "Failed") {
      throw new Error(
        `Transcription failed: ${JSON.stringify(statusRes.data)}`
      );
    }
  }

  if (!filesUrl) {
    throw new Error("No files URL returned from transcription job");
  }

  // 3. Download transcription result files
  const filesRes = await axios.get(filesUrl, {
    headers: { "Ocp-Apim-Subscription-Key": AZURE_KEY },
  });

  const files = filesRes.data.values || [];
  const contentFile = files.find((f: any) => f.kind === "Transcription");

  if (!contentFile || !contentFile.links?.contentUrl) {
    throw new Error("No transcription content file found");
  }

  const contentRes = await axios.get(contentFile.links.contentUrl);
  const transcriptionData = contentRes.data;

  // 4. Parse Azure result → our format
  return parseAzureTranscription(transcriptionData);
}

function parseAzureTranscription(data: any): TranscriptionResult {
  const transcript = data.combinedRecognizedPhrases?.[0]?.display || "";

  // Lấy phrases từ channel 0 để tránh duplicate (stereo audio)
  const phrases = (data.recognizedPhrases || []).filter(
    (p: any) => p.channel === 0
  );

  const highlightTimings = phrases
    .filter((p: any) => p.nBest?.[0]?.display)
    .map((p: any) => ({
      text: p.nBest[0].display,
      startTime: p.offsetMilliseconds || 0,
      endTime: (p.offsetMilliseconds || 0) + (p.durationMilliseconds || 0),
    }));

  return { transcript, highlightTimings };
}

async function uploadToCloudinary(filePath: string): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const cloudApiKey = process.env.CLOUDINARY_API_KEY;
  const cloudApiSecret = process.env.CLOUDINARY_API_SECRET;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName) throw new Error("Cloudinary not configured");

  if (cloudApiKey && cloudApiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: cloudApiKey,
      api_secret: cloudApiSecret,
    });
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: "video",
    });
    return result.secure_url;
  }

  if (uploadPreset) {
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath));
    form.append("upload_preset", uploadPreset.trim());

    const res = await axios.post(
      `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
      form,
      { headers: form.getHeaders(), maxContentLength: Infinity }
    );
    return res.data.secure_url;
  }

  throw new Error("Cloudinary credentials not configured");
}

async function handleTranscription(
  audioUrl: string,
  fallbackTranscript?: string
) {
  try {
    return await transcribeAudioUrl(audioUrl);
  } catch (err: any) {
    const isFreeTierError =
      err.code === "InvalidRequest" ||
      err.code === "InvalidSubscription" ||
      err.message?.includes("Standard");

    if (isFreeTierError) {
      console.warn(`[AzureAI] Free tier - skipping transcription`);
      return {
        transcript: fallbackTranscript || "",
        highlightTimings: [],
      };
    }
    throw err;
  }
}

export async function processAzureJob(
  taskId: string,
  tasks: Map<string, any>,
  payload: { transcript?: string; audio_path?: string; level: string }
) {
  const task = tasks.get(taskId);
  if (!task) return;

  task.status = "running";

  try {
    const { transcript, audio_path, level } = payload;

    if (audio_path && transcript) {
      const result = await handleTranscription(audio_path, transcript);
      task.result = {
        transcript: result.transcript,
        highlightTimings: result.highlightTimings,
        audio_path,
        source: "azure-tts-stt",
      };
    } else if (transcript && !audio_path) {
      const filename = await synthesizeToFile(transcript, level);
      const filePath = path.resolve(STATIC_DIR, filename);

      try {
        const publicUrl = await uploadToCloudinary(filePath);
        const result = await handleTranscription(publicUrl, transcript);

        task.result = {
          transcript: result.transcript,
          highlightTimings: result.highlightTimings,
          audio_path: publicUrl,
          source: "azure-tts-stt",
        };

        fs.unlinkSync(filePath);
      } catch (uploadErr) {
        console.error("[AzureAI] Upload failed:", uploadErr);
        const baseUrl =
          process.env.BASE_URL ||
          `http://localhost:${process.env.PORT || 5000}`;
        task.result = {
          transcript,
          highlightTimings: [],
          audio_path: `${baseUrl}/static/${filename}`,
          source: "azure-tts-stt",
        };
      }
    } else if (audio_path && !transcript) {
      const result = await handleTranscription(audio_path);
      task.result = {
        transcript: result.transcript,
        highlightTimings: result.highlightTimings,
        audio_path,
        source: "azure-tts-stt",
      };
    }

    task.status = "done";
  } catch (err: any) {
    console.error(`[AzureAI] Job ${taskId} error:`, err);
    task.status = "failed";
    task.error = err.message || String(err);
  }
}

// ==================== OPTIONAL: Convert audio if needed ====================
// Nếu audio không phải WAV, có thể dùng ffmpeg (cần spawn) hoặc upload as-is nếu Azure accept
// Để đơn giản, ta giả sử audio_url đã public và accessible. Nếu cần convert local file → upload, cần thêm logic.
