import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemConfig extends Document {
  configName: string;
  value: any;
}

const SystemConfigSchema = new Schema<ISystemConfig>({
  configName: String,
  value: Schema.Types.Mixed,
});

export const SystemConfig = mongoose.model<ISystemConfig>(
  'SystemConfig',
  SystemConfigSchema,
);
