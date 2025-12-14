import { Request, Response } from "express";
import { adjustmentRequestService } from "../services/adjustment_request.service";
import { ApiResponse } from "../utils/ApiResponse";

export const adjustmentRequestController = {
  // Tạo yêu cầu điều chỉnh
  createRequest: async (req: Request, res: Response) => {
    try {
      const collaboratorId = req.user?._id; // Giả sử middleware auth đã gán user vào req
      const requestData = { ...req.body, collaboratorId };
      const newRequest = await adjustmentRequestService.createRequest(
        requestData
      );
      return res
        .status(201)
        .json(
          ApiResponse.success(newRequest, "Tạo yêu cầu điều chỉnh thành công")
        );
    } catch (error: any) {
      return res.status(500).json(ApiResponse.fail(error.message));
    }
  },

  // Lấy danh sách yêu cầu của học viên (cho Student xem)
  getStudentRequests: async (req: Request, res: Response) => {
    try {
      const studentId = req.user?._id;
      const requests = await adjustmentRequestService.getRequestsByStudent(
        studentId
      );
      return res
        .status(200)
        .json(
          ApiResponse.success(requests, "Lấy danh sách yêu cầu thành công")
        );
    } catch (error: any) {
      return res.status(500).json(ApiResponse.fail(error.message));
    }
  },

  // Lấy danh sách yêu cầu do CTV tạo (cho CTV xem lịch sử)
  getCollaboratorRequests: async (req: Request, res: Response) => {
    try {
      const collaboratorId = req.user?._id;
      const requests = await adjustmentRequestService.getRequestsByCollaborator(
        collaboratorId
      );
      return res
        .status(200)
        .json(
          ApiResponse.success(requests, "Lấy danh sách yêu cầu thành công")
        );
    } catch (error: any) {
      return res.status(500).json(ApiResponse.fail(error.message));
    }
  },

  // Lấy lịch sử yêu cầu của một học viên cụ thể (cho CTV xem trong detail drawer)
  getRequestsByStudentId: async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;
      const requests = await adjustmentRequestService.getRequestsByStudentId(
        studentId
      );
      return res
        .status(200)
        .json(
          ApiResponse.success(
            requests,
            "Lấy lịch sử yêu cầu học viên thành công"
          )
        );
    } catch (error: any) {
      return res.status(500).json(ApiResponse.fail(error.message));
    }
  },

  // Lấy chi tiết một yêu cầu
  getRequestById: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const request = await adjustmentRequestService.getRequestById(id);
      if (!request) {
        return res.status(404).json(ApiResponse.fail("Không tìm thấy yêu cầu"));
      }
      return res
        .status(200)
        .json(ApiResponse.success(request, "Lấy chi tiết yêu cầu thành công"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.fail(error.message));
    }
  },

  // Học viên phản hồi (Approve/Reject)
  respondToRequest: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, rejectionReason } = req.body;
      const studentId = req.user?._id;

      const updatedRequest = await adjustmentRequestService.respondToRequest(
        id,
        studentId,
        status,
        rejectionReason
      );
      return res
        .status(200)
        .json(
          ApiResponse.success(updatedRequest, "Phản hồi yêu cầu thành công")
        );
    } catch (error: any) {
      return res.status(500).json(ApiResponse.fail(error.message));
    }
  },

  // Lấy chi tiết lộ trình đầy đủ (Timeline) cho CTV
  getFullLearningPath: async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;
      const data = await adjustmentRequestService.getFullLearningPathForStudent(
        studentId
      );
      return res
        .status(200)
        .json(ApiResponse.success(data, "Lấy lộ trình chi tiết thành công"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.fail(error.message));
    }
  },
};
