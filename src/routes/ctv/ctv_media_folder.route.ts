import express from "express";
import * as folderController from "../../controllers/media_folder.controller";


const router = express.Router();

// ===== /api/folders =====
router.post("/",  folderController.createFolderController);
router.get("/tree", folderController.getFolderTreeController);

router.put("/media/:id", folderController.updateMediaController);   // ✏️ Sửa media
router.delete("/media/:id", folderController.deleteMediaController); // 🗑️ Xóa media

router.get("/:id", folderController.getFolderByIdController);
router.put("/:id",  folderController.updateFolderController);
router.delete("/:id", folderController.deleteFolderController);

// ===== /api/folders/:id/medias =====
router.post("/:id/medias", folderController.addMediaToFolderController);
router.get("/:id/medias", folderController.getMediasByFolderController);


export default router;
