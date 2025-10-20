import { Types } from "mongoose";
import { appEvents } from "../core/appEvents";
import { LessonManager } from "../models/lesson_manager.model";
import logger from "../configs/logger";

/**
 * LessonManagerSyncListener
 * Tự động đồng bộ các field (dictation_ids, quiz_ids, shadowing_ids, ...)
 * trong LessonManager khi entity được tạo hoặc cập nhật.
 */
export class LessonManagerSyncListener {
  private entityName: string;
  private fieldName: keyof typeof LessonManager.schema.obj;

  constructor(entityName: string, fieldName: keyof typeof LessonManager.schema.obj) {
    this.entityName = entityName;
    this.fieldName = fieldName;
  }

  /**
   * Khởi tạo lắng nghe các sự kiện "created" và "updated"
   */
  public register(): void {
    appEvents.on(`${this.entityName}.created`, async (entity: any) => {
      await this.handleCreated(entity);
    });

    appEvents.on(`${this.entityName}.updated`, async (entity: any) => {
      await this.handleUpdated(entity);
    });

    logger.info(
      `[LessonManagerSyncListener] Registered for ${this.entityName}.created & ${this.entityName}.updated`
    );
  }

  /**
   * Xử lý khi entity được tạo → thêm vào các LessonManager liên quan
   */
  private async handleCreated(entity: any): Promise<void> {
    try {
      const { _id, topic = [] } = entity;
      if (!Array.isArray(topic) || topic.length === 0) {
        logger.info(`[${this.entityName}] Không có topic để đồng bộ.`);
        return;
      }

      const entityId = new Types.ObjectId(_id.toString());
      logger.info(
        `[${this.entityName}] Đồng bộ LessonManager cho ${this.entityName}.created (${topic.length} topic)`
      );

      await Promise.all(
        topic.map(async (topicId: Types.ObjectId) => {
          const lessonManager = await LessonManager.findById(topicId);
          if (!lessonManager) return;

          const ids = (lessonManager[this.fieldName] as Types.ObjectId[]) || [];
          if (!ids.some((id) => id.toString() === entityId.toString())) {
            ids.push(entityId);
            lessonManager.set(this.fieldName, ids);
            await lessonManager.save();
            logger.info(
              `[${this.entityName}] ✅ Thêm ${this.entityName} ${entityId} vào LessonManager ${lessonManager._id}`
            );
          }
        })
      );
    } catch (err) {
      logger.error(
        `[${this.entityName}] ❌ Lỗi khi xử lý ${this.entityName}.created: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  }

  /**
   * Xử lý khi entity được cập nhật → gỡ và thêm lại trong LessonManager
   */
  private async handleUpdated(entity: any): Promise<void> {
    try {
      const entityId = new Types.ObjectId(entity._id.toString());
      const newTopicIds = (entity.topic || []).map((t: any) =>
        t instanceof Types.ObjectId ? t.toString() : t
      );

      logger.info(`[${this.entityName}] Bắt đầu đồng bộ LessonManager cho ${this.entityName}.updated`);

      // Gỡ entity khỏi LessonManager cũ
      const pullResult = await LessonManager.updateMany(
        { [this.fieldName]: entityId, _id: { $nin: newTopicIds } },
        { $pull: { [this.fieldName]: entityId } }
      );
      if (pullResult.modifiedCount > 0) {
        logger.info(
          `[${this.entityName}] 🗑️ Gỡ ${this.entityName} ${entityId} khỏi ${pullResult.modifiedCount} LessonManager cũ`
        );
      }

      // Thêm entity vào LessonManager mới
      const addResult = await LessonManager.updateMany(
        { _id: { $in: newTopicIds } },
        { $addToSet: { [this.fieldName]: entityId } }
      );
      if (addResult.modifiedCount > 0) {
        logger.info(
          `[${this.entityName}] ➕ Thêm ${this.entityName} ${entityId} vào ${addResult.modifiedCount} LessonManager mới`
        );
      }

      logger.info(`[${this.entityName}] ✅ Đồng bộ LessonManager cho ${this.entityName}.updated hoàn tất.`);
    } catch (err) {
      logger.error(
        `[${this.entityName}] ❌ Lỗi khi xử lý ${this.entityName}.updated: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  }
}
