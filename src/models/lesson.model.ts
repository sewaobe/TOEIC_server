import mongoose, { Schema, Document, Types } from "mongoose";

export interface ILesson extends Document {
  type: string;
  title: string;
  tags: string[];
  summary: string;
  planned_completion_time: number;
  weight: number;
  sections_id: Types.ObjectId[]; // 🔗 tham chiếu đến LessonSection
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const LessonSchema = new Schema<ILesson>({
  type: String,
  title: { type: String, required: true },
  tags: [{ type: String, default: "" }],
  summary: { type: String, default: "" },
  planned_completion_time: { type: Number, default: 0 },
  weight: { type: Number, default: 0.1 },
  sections_id: [{ type: Schema.Types.ObjectId, ref: "LessonSection" }], 
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User" },
  updated_at: { type: Date, default: Date.now },
});

export const Lesson = mongoose.model<ILesson>("Lesson", LessonSchema);

// {
//     "title": "Thì hiện tại đơn",
//     "summary": "Trình độ: Cơ bản | Trạng thái: Đã hoàn thành",
//     "sections": [
//         {
//             "id": "section-1760349579083",
//             "title": "Lỗi sai mới",
//             "order": 0,
//             "type": "error",
//             "error": {
//                 "wrong": "asd",
//                 "correct": "asd",
//                 "explanation": "asd"
//             }
//         },
//         {
//             "id": "section-1760349588700",
//             "title": "Ví dụ mới",
//             "order": 1,
//             "type": "example",
//             "example": {
//                 "en": "asd",
//                 "vi": "asda",
//                 "note": ""
//             }
//         }
//     ]
// }