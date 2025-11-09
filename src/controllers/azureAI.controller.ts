import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import * as azureService from "../services/azureSpeech.service";

interface Task {
  id: string;
  status: "pending" | "running" | "done" | "cancelled" | "failed";
  result?: any;
  error?: string;
}

const tasks = new Map<string, Task>();

export const startAzureProcessController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { transcript, audio_path, level = "A1" } = req.body;

    if (!transcript && !audio_path) {
      return res
        .status(400)
        .json({ error: "Cần nhập transcript hoặc audio_path để xử lý." });
    }

    const taskId = uuidv4();
    tasks.set(taskId, { id: taskId, status: "pending" });

    azureService.processAzureJob(taskId, tasks, {
      transcript,
      audio_path,
      level,
    });

    return res.status(200).json({ task_id: taskId, status: "started" });
  } catch (err) {
    next(err);
  }
};

export const getAzureStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { taskId } = req.params;
    const task = tasks.get(taskId);

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const statusMap: Record<string, any> = {
      done: { status: "done", result: task.result },
      failed: { status: "failed", result: { error: task.error } },
      cancelled: { status: "cancelled", result: { error: "Task cancelled" } },
    };

    return res
      .status(200)
      .json(statusMap[task.status] || { status: task.status });
  } catch (err) {
    next(err);
  }
};

export const cancelAzureTaskController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { taskId } = req.params;
    const task = tasks.get(taskId);

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    task.status = "cancelled";
    return res.status(200).json({ status: "cancelled" });
  } catch (err) {
    next(err);
  }
};
