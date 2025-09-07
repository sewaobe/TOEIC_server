import { Date } from "mongoose";

export interface IUserTestHistory {
    submit_at: Date;
    completedPart: string;
    score: number;
    duration: number;
    correctCount: number;
    questionCount: number;
}