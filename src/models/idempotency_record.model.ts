import { Document, model, Schema, Types } from "mongoose";

export type IdempotencyRecordStatus = "processing" | "completed" | "failed";

export interface IIdempotencyRecord extends Document {
  user_id: Types.ObjectId;
  scope: string;
  key: string;
  request_hash: string;
  status: IdempotencyRecordStatus;
  resource_type?: string;
  resource_id?: string;
  response_payload?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const IdempotencyRecordSchema = new Schema<IIdempotencyRecord>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    scope: { type: String, required: true },
    key: { type: String, required: true },
    request_hash: { type: String, required: true },
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      required: true,
      default: "processing",
    },
    resource_type: { type: String },
    resource_id: { type: String },
    response_payload: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

IdempotencyRecordSchema.index({ user_id: 1, scope: 1, key: 1 }, { unique: true });

export const IdempotencyRecord = model<IIdempotencyRecord>(
  "IdempotencyRecord",
  IdempotencyRecordSchema
);
