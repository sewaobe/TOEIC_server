import { LessonManagerSyncListener } from "./lesson_manager.listener";

// Khởi tạo listener cho từng loại entity
const syncListeners = [
    new LessonManagerSyncListener("dictation", "dictation_ids"),
    new LessonManagerSyncListener("shadowing", "shadowing_ids"),
    new LessonManagerSyncListener("quiz", "quiz_ids"),
    new LessonManagerSyncListener("lesson", "lesson_ids"),
    new LessonManagerSyncListener("topic", "topic_vocabulary_ids"),
];

// Đăng ký tất cả
syncListeners.forEach((listener) => listener.register());

