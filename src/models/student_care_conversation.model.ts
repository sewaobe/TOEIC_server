import mongoose, { Schema, Document, Types } from "mongoose";

export const CARE_SIGNAL_TYPES = [
  "low_engagement",
  "no_recent_assessment",
  "studying_without_score_gain",
  "skill_plateau",
  "declining_skill",
  "continue_monitoring",
] as const;

export const CARE_CONVERSATION_STATUSES = [
  "waiting_for_response",
  "responded",
  "needs_support",
  "solution_provided",
  "follow_up_due",
  "resolved",
] as const;

export const OPEN_CARE_CONVERSATION_STATUSES = [
  "waiting_for_response",
  "responded",
  "needs_support",
  "solution_provided",
  "follow_up_due",
] as const;

export type CareSignalType = (typeof CARE_SIGNAL_TYPES)[number];
export type CareConversationStatus = (typeof CARE_CONVERSATION_STATUSES)[number];

export interface IStudentCareConversation extends Document {
  student_id: Types.ObjectId;
  collaborator_id: Types.ObjectId;
  learning_path_id: Types.ObjectId | null;
  signal_type: CareSignalType;
  signal_scope_key: string;
  signal_snapshot: Record<string, any>;
  question_template: {
    template_id: string;
    version: number;
    original_text: string;
    sent_text: string;
    edited_by_collaborator: boolean;
  };
  primary_options: Array<Record<string, any>>;
  secondary_options_by_primary: Record<string, Array<Record<string, any>>>;
  student_primary_answer?: Record<string, any>;
  student_secondary_answer?: Record<string, any>;
  student_note?: string;
  status: CareConversationStatus;
  suggested_solutions: Array<Record<string, any>>;
  solution_history: Array<Record<string, any>>;
  follow_up?: Record<string, any>;
  responded_at?: Date;
  latest_solution_at?: Date;
  resolved_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CareQuestionOptionSchema = new Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
    requires_support: { type: Boolean, default: false },
    allow_note: { type: Boolean, default: false },
    requires_secondary: { type: Boolean, default: false },
  },
  { _id: false }
);

const StudentCareConversationSchema = new Schema<IStudentCareConversation>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    collaborator_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    learning_path_id: { type: Schema.Types.ObjectId, ref: "LearningPath", default: null },
    signal_type: { type: String, enum: CARE_SIGNAL_TYPES, required: true },
    signal_scope_key: { type: String, required: true },
    signal_snapshot: { type: Schema.Types.Mixed, required: true },
    question_template: {
      template_id: { type: String, required: true },
      version: { type: Number, required: true },
      original_text: { type: String, required: true },
      sent_text: { type: String, required: true },
      edited_by_collaborator: { type: Boolean, default: false },
    },
    primary_options: { type: [CareQuestionOptionSchema], default: [] },
    secondary_options_by_primary: { type: Schema.Types.Mixed, default: {} },
    student_primary_answer: { type: Schema.Types.Mixed },
    student_secondary_answer: { type: Schema.Types.Mixed },
    student_note: { type: String, maxlength: 1000 },
    status: {
      type: String,
      enum: CARE_CONVERSATION_STATUSES,
      default: "waiting_for_response",
      required: true,
    },
    suggested_solutions: { type: [Schema.Types.Mixed], default: [] } as any,
    solution_history: { type: [Schema.Types.Mixed], default: [] } as any,
    follow_up: { type: Schema.Types.Mixed },
    responded_at: { type: Date },
    latest_solution_at: { type: Date },
    resolved_at: { type: Date },
  },
  { timestamps: true }
);

StudentCareConversationSchema.index({ student_id: 1, status: 1, createdAt: -1 });
StudentCareConversationSchema.index({ collaborator_id: 1, status: 1, createdAt: -1 });
StudentCareConversationSchema.index({
  student_id: 1,
  signal_type: 1,
  signal_scope_key: 1,
  learning_path_id: 1,
  status: 1,
});
StudentCareConversationSchema.index({ "follow_up.due_at": 1, status: 1 });

export const StudentCareConversation = mongoose.model<IStudentCareConversation>(
  "StudentCareConversation",
  StudentCareConversationSchema
);

