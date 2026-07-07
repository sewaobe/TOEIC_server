import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import FormData from "form-data";
import { Types } from "mongoose";
import { PracticeSession } from "../models/practice_session.model";
import {
  IShadowingSegmentResult,
  ShadowingAttempt,
  ShadowingAttemptStatus,
} from "../models/shadowing_attempt.model";
import { SubmissionType } from "../models/enums/SubmissionType";

interface ShadowingAttemptPayload {
  total_segments: number;
  completed_segments: number;
  segment_results: IShadowingSegmentResult[];
  duration?: number;
  similarity_score?: number;
  accuracy_score?: number;
  fluency_score?: number;
  intonation_score?: number;
  overall_feedback?: string;
}

const MAX_ATTEMPTS_PER_SEGMENT = 3;

const normalizeSegmentResults = (segmentResults: IShadowingSegmentResult[] = []) => {
  return segmentResults.map((segment) => ({
    index: Number(segment.index),
    text: segment.text || "",
    attempts: (segment.attempts || []).slice(-MAX_ATTEMPTS_PER_SEGMENT).map((attempt) => ({
      user_transcript: attempt.user_transcript || "",
      similarity_score: Number(attempt.similarity_score || 0),
      accuracy_score: attempt.accuracy_score,
      feedback: attempt.feedback,
      duration: attempt.duration,
      attempted_at: attempt.attempted_at ? new Date(attempt.attempted_at) : new Date(),
    })),
  }));
};

const getLatestSegmentAttempts = (segmentResults: IShadowingSegmentResult[]) =>
  segmentResults
    .map((segment) => segment.attempts?.[segment.attempts.length - 1])
    .filter(Boolean);

const getAverageScore = (segmentResults: IShadowingSegmentResult[]) => {
  const latestAttempts = getLatestSegmentAttempts(segmentResults);
  if (latestAttempts.length === 0) return 0;

  return Math.round(
    latestAttempts.reduce(
      (sum, attempt) => sum + Number(attempt?.similarity_score || 0),
      0,
    ) / latestAttempts.length,
  );
};

const getTotalDuration = (segmentResults: IShadowingSegmentResult[]) =>
  getLatestSegmentAttempts(segmentResults).reduce(
    (sum, attempt) => sum + Number(attempt?.duration || 0),
    0,
  );

const getOwnedSession = async (sessionId: string, userId: string) => {
  const session = await PracticeSession.findOne({
    _id: new Types.ObjectId(sessionId),
    user_id: new Types.ObjectId(userId),
    practice_type: "shadowing",
  });

  if (!session) {
    throw new Error("Shadowing practice session not found");
  }

  return session;
};

const uploadAudioToCloudinary = (file: Express.Multer.File): Promise<string> => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const cloudApiKey = process.env.CLOUDINARY_API_KEY;
  const cloudApiSecret = process.env.CLOUDINARY_API_SECRET;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName) {
    throw new Error("Cloudinary credentials not configured");
  }

  if (cloudApiKey && cloudApiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: cloudApiKey,
      api_secret: cloudApiSecret,
    });

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "video",
          folder: "shadowing-attempts",
        },
        (error, result) => {
          if (error || !result?.secure_url) {
            reject(error || new Error("Failed to upload shadowing audio"));
            return;
          }
          resolve(result.secure_url);
        },
      );

      stream.end(file.buffer);
    });
  }

  if (uploadPreset) {
    const form = new FormData();
    form.append("file", file.buffer, {
      filename: file.originalname || "shadowing-attempt.webm",
      contentType: file.mimetype || "audio/webm",
    });
    form.append("upload_preset", uploadPreset.trim());
    form.append("folder", "shadowing-attempts");

    return axios
      .post(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
      .then((res) => res.data.secure_url);
  }

  throw new Error("Cloudinary credentials not configured");
};

const persistCompletedShadowingAttempt = async (
  session: Awaited<ReturnType<typeof getOwnedSession>>,
  payload: ShadowingAttemptPayload,
  normalizedSegments: IShadowingSegmentResult[],
  recordedAudio?: string,
) => {
  const completedSegments = payload.completed_segments || normalizedSegments.length;
  const similarityScore = payload.similarity_score ?? getAverageScore(normalizedSegments);
  const duration = payload.duration ?? getTotalDuration(normalizedSegments);

  const update: any = {
    $set: {
      shadowing_id: session.topic_id,
      status: "completed" satisfies ShadowingAttemptStatus,
      submit_type: SubmissionType.PRACTICE,
      total_segments: payload.total_segments,
      completed_segments: completedSegments,
      segment_results: normalizedSegments,
      duration,
      similarity_score: similarityScore,
      accuracy_score: payload.accuracy_score,
      fluency_score: payload.fluency_score,
      intonation_score: payload.intonation_score,
      overall_feedback: payload.overall_feedback,
      finished_at: new Date(),
    },
    $setOnInsert: {
      user_id: session.user_id,
      session_id: session._id,
      started_at: session.started_at || new Date(),
    },
  };

  if (recordedAudio) {
    update.$set.recorded_audio = recordedAudio;
  } else {
    update.$unset = { recorded_audio: "" };
  }

  const attempt = await ShadowingAttempt.findOneAndUpdate(
    {
      session_id: session._id,
      user_id: session.user_id,
    },
    update,
    { new: true, upsert: true },
  );

  session.status = "completed";
  session.completed_items = completedSegments;
  session.completed_indices = normalizedSegments.map((segment) => segment.index);
  session.total_accuracy = similarityScore;
  session.completed_at = new Date();
  session.last_activity_at = new Date();
  await session.save();

  return attempt;
};

export const getShadowingAttemptBySessionService = async (
  sessionId: string,
  userId: string,
) => {
  await getOwnedSession(sessionId, userId);

  return ShadowingAttempt.findOne({
    session_id: new Types.ObjectId(sessionId),
    user_id: new Types.ObjectId(userId),
  }).sort({ updatedAt: -1 });
};

export const saveShadowingAttemptDraftService = async (
  sessionId: string,
  userId: string,
  payload: ShadowingAttemptPayload,
) => {
  const session = await getOwnedSession(sessionId, userId);
  const normalizedSegments = normalizeSegmentResults(payload.segment_results);

  return ShadowingAttempt.findOneAndUpdate(
    {
      session_id: session._id,
      user_id: session.user_id,
    },
    {
      $set: {
        shadowing_id: session.topic_id,
        status: "draft" satisfies ShadowingAttemptStatus,
        submit_type: SubmissionType.PRACTICE,
        total_segments: payload.total_segments,
        completed_segments: payload.completed_segments,
        segment_results: normalizedSegments,
        duration: payload.duration || 0,
        similarity_score: payload.similarity_score || 0,
        accuracy_score: payload.accuracy_score,
        fluency_score: payload.fluency_score,
        intonation_score: payload.intonation_score,
        overall_feedback: payload.overall_feedback,
      },
      $setOnInsert: {
        user_id: session.user_id,
        session_id: session._id,
        started_at: new Date(),
      },
    },
    { new: true, upsert: true },
  );
};

export const completeShadowingAttemptService = async (
  sessionId: string,
  userId: string,
  payload: ShadowingAttemptPayload,
  audioFile?: Express.Multer.File,
) => {
  const session = await getOwnedSession(sessionId, userId);
  const normalizedSegments = normalizeSegmentResults(payload.segment_results);
  const recordedAudio = audioFile ? await uploadAudioToCloudinary(audioFile) : undefined;

  return persistCompletedShadowingAttempt(
    session,
    payload,
    normalizedSegments,
    recordedAudio,
  );
};

export const fastCompleteShadowingAttemptService = async (
  sessionId: string,
  userId: string,
  payload: ShadowingAttemptPayload,
) => {
  const session = await getOwnedSession(sessionId, userId);
  const normalizedSegments = normalizeSegmentResults(payload.segment_results);

  return persistCompletedShadowingAttempt(
    session,
    {
      ...payload,
      completed_segments: payload.total_segments,
      duration: payload.duration ?? getTotalDuration(normalizedSegments),
      similarity_score: payload.similarity_score ?? getAverageScore(normalizedSegments),
    },
    normalizedSegments,
  );
};

export const deleteShadowingAttemptBySessionService = async (
  sessionId: string,
  userId: string,
) => {
  await getOwnedSession(sessionId, userId);

  return ShadowingAttempt.deleteMany({
    session_id: new Types.ObjectId(sessionId),
    user_id: new Types.ObjectId(userId),
  });
};
