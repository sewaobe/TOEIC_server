import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
  name: string;
  permissions: string[];
}

const RoleSchema = new Schema<IRole>({
  name: { type: String, required: true },
  permissions: [String],
});

export const Role = mongoose.model<IRole>('Role', RoleSchema);
