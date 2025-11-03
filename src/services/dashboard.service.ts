import { Test, User, Comment, Lesson, Role } from "../models";
import { TestStatus } from "../models/enums/TestStatus";
import moment from "moment";

// ============================
// === MOCK DATA CHO FE ===
// ============================
const mockTopContent = [
  {
    title: "TOEIC Reading Part 7 - Advanced",
    learners: 456,
    rating: 4.8,
    completion: 82,
  },
  {
    title: "Business Vocabulary Set 1",
    learners: 389,
    rating: 4.7,
    completion: 91,
  },
  {
    title: "Listening Practice - Part 3",
    learners: 312,
    rating: 4.6,
    completion: 76,
  },
];

const mockNeedsAttention = [
  {
    title: "Grammar Basics - Tenses",
    issue: "Low completion rate (32%)",
    priority: "high",
  },
  { title: "Minitest #12", issue: "3 error reports", priority: "high" },
  {
    title: "Vocabulary Set 5",
    issue: "Rating dropped to 3.2",
    priority: "medium",
  },
];

const mockWeeklyEngagement = [
  { day: "Mon", learners: 245 },
  { day: "Tue", learners: 312 },
  { day: "Wed", learners: 289 },
  { day: "Thu", learners: 356 },
  { day: "Fri", learners: 401 },
  { day: "Sat", learners: 478 },
  { day: "Sun", learners: 423 },
];

// ============================
// === LOGIC CHÍNH ===
// ============================

// Hàm chính để tổng hợp dữ liệu dashboard cho cộng tác viên
export const getCollaboratorDashboardData = async (collaboratorId: string) => {
  const kpiData = await getKpiData(collaboratorId);
  const actionItems = await getActionItems(collaboratorId);
  const contentByStatus = await getContentByStatus(collaboratorId);

  return {
    kpiData,
    actionItems,
    topContent: mockTopContent,
    needsAttention: mockNeedsAttention,
    weeklyEngagement: mockWeeklyEngagement,
    contentByStatus,
  };
};

// 1. Lấy dữ liệu KPI
async function getKpiData(collaboratorId: string) {
  // Count only users with the "student" role
  const lastMonth = moment().subtract(30, "days").toDate();
  const studentRole = await Role.findOne({
    name: { $regex: "^student$", $options: "i" },
  });
  let totalLearners = 0;
  let newLearners = 0;

  if (studentRole) {
    totalLearners = await User.countDocuments({ role_id: studentRole._id });
    newLearners = await User.countDocuments({
      role_id: studentRole._id,
      created_at: { $gte: lastMonth },
    });
  }

  const oldLearners = totalLearners - newLearners;
  const learnerGrowth =
    oldLearners > 0 ? (newLearners / oldLearners) * 100 : 100;

  // Các số liệu này cần có model Rating, tạm thời mock
  const avgRating = 4.6;
  const ratingChange = 0.3;
  const engagementRate = 78.5;
  const engagementChange = 5.2;
  const completionRate = 65.3;
  const completionChange = -2.1;

  return {
    totalLearners,
    learnerGrowth: parseFloat(learnerGrowth.toFixed(1)),
    avgRating,
    ratingChange,
    engagementRate,
    engagementChange,
    completionRate,
    completionChange,
  };
}

// 2. Lấy các mục cần hành động
async function getActionItems(collaboratorId: string) {
  const pendingApproval = await Test.countDocuments({
    created_by: collaboratorId,
    status: TestStatus.PENDING,
  });
  const unansweredComments = 0; // Tạm thời
  const needsUpdate = 0; // Tạm thời
  const errorReports = 0; // Tạm thời

  return {
    pendingApproval,
    unansweredComments,
    needsUpdate,
    errorReports,
  };
}

// 3. Lấy dữ liệu nội dung theo trạng thái
async function getContentByStatus(collaboratorId: string) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthlyData = [];

  for (let i = 5; i >= 0; i--) {
    const month = moment().subtract(i, "months");
    const startOfMonth = month.startOf("month").toDate();
    const endOfMonth = month.endOf("month").toDate();

    const query = {
      created_by: collaboratorId,
      created_at: { $gte: startOfMonth, $lte: endOfMonth },
    };

    // Đếm bài test
    const testDraft = await Test.countDocuments({
      ...query,
      status: TestStatus.DRAFT,
    });
    const testPublished = await Test.countDocuments({
      ...query,
      status: { $ne: TestStatus.DRAFT },
    });

    // Đếm bài học (giả sử Lesson model có cấu trúc tương tự)
    const lessonDraft = await Lesson.countDocuments({
      ...query,
      status: "draft",
    });
    const lessonPublished = await Lesson.countDocuments({
      ...query,
      status: { $ne: "draft" },
    });

    monthlyData.push({
      month: months[month.month()],
      published: testPublished + lessonPublished,
      draft: testDraft + lessonDraft,
    });
  }
  return monthlyData;
}
