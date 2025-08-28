import { IUserProgress, IUser } from "../models"; // import interface

export interface ProfileDto {
  infor: IUser;
  // progress: lấy nguyên bản UserProgress
  progress: IUserProgress[];
  // highest test
  highestTest: {
    testId: string;
    score: number;
    correctCount: number;
    listeningCorrect: number;
    readingCorrect: number;
  } | null;
}
