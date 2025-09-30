import { IUser, IUserLearningPath } from "../models"; // import interface

export interface ProfileDto {
  infor: IUser;
  // progress: lấy nguyên bản UserProgress
  progress: IUserLearningPath[];
  // highest test
  highestTest: {
    testId: string;
    score: number;
    correctCount: number;
    listeningCorrect: number;
    readingCorrect: number;
  } | null;
}
