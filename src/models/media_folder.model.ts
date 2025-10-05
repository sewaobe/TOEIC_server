import { Schema, model, Document, Types } from "mongoose";

/**
 * 🧩 Interface - Media Folder
 * Một folder có thể chứa:
 *  - nhiều folder con (children)
 *  - nhiều media (video, hình, pdf, ...)
 */
export interface IMediaFolder extends Document {
  name: string;
  parent?: Types.ObjectId | null; // null nếu là folder gốc
  children: Types.ObjectId[];     // danh sách ID folder con
  medias: Types.ObjectId[];       // danh sách ID media trong folder này
  path: string;                   // VD: "Ngữ pháp cơ bản/Thì hiện tại đơn"
  created_by?: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
}

const mediaFolderSchema = new Schema<IMediaFolder>(
  {
    name: { type: String, required: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: "MediaFolder", default: null },
    children: [{ type: Schema.Types.ObjectId, ref: "MediaFolder" }],
    medias: [{ type: Schema.Types.ObjectId, ref: "Media" }],
    path: { type: String, required: true, trim: true },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const MediaFolder = model<IMediaFolder>("MediaFolder", mediaFolderSchema);
