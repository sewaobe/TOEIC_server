import { TestStatus } from "../models/enums/TestStatus";
import { TestType } from "../models/enums/TestType";

export interface IUserRecentTest {
    test_id: string;
    title: string;
    type: TestType;
    status: TestStatus;
    topic: string;
    score: number;
    countSubmit: number;
    countComment: number;
    created_at: Date;
    submit_at: Date;
}
