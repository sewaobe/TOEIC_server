import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IEmailLog extends Document {
  _id: Types.ObjectId;
  student_id: Types.ObjectId;
  collaborator_id?: Types.ObjectId | null;
  subject: string;
  body_html: string;
  sent_at: Date;
  channel: string;
  meta?: any;
}

const EmailLogSchema = new Schema<IEmailLog>({
  student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  collaborator_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  subject: { type: String, required: true },
  body_html: { type: String, required: true },
  sent_at: { type: Date, default: Date.now },
  channel: { type: String, default: 'email' },
  meta: { type: Schema.Types.Mixed, default: {} },
});

export const EmailLog = mongoose.model<IEmailLog>('EmailLog', EmailLogSchema);
