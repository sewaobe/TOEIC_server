import mongoose, { Document, Schema } from "mongoose";

export interface IDictionaryEntry extends Document {
  english_word: string;
  normalized_key: string;
  query_aliases: string[];
  data: Record<string, any>;
  source_raw?: any;
  model_used?: string;
  lookup_count: number;
  last_lookup_at?: Date;
  created_at: Date;
  updated_at: Date;
}

const DictionaryEntrySchema = new Schema<IDictionaryEntry>(
  {
    english_word: { type: String, required: true, trim: true },
    normalized_key: { type: String, required: true, unique: true, index: true },
    query_aliases: [{ type: String, trim: true, index: true }],
    data: { type: Schema.Types.Mixed, required: true },
    source_raw: { type: Schema.Types.Mixed },
    model_used: { type: String, trim: true },
    lookup_count: { type: Number, default: 0 },
    last_lookup_at: { type: Date },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export const DictionaryEntry = mongoose.model<IDictionaryEntry>(
  "DictionaryEntry",
  DictionaryEntrySchema
);
