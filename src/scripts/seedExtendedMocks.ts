import mongoose, { Types } from "mongoose";
import {
  Vocabulary,
  TopicVocabulary,
  Quiz,
  Question,
  Lesson,
  LessonSection,
  Media,
} from "../models";

const DEFAULT_CREATOR_ID = new Types.ObjectId("68dd1ec97e6feb7d175ce104");

const MONGO = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/toeic_local";

// Provided 10 video links + titles (use these to create Lesson + Media + LessonSection)
const VIDEO_LESSONS = [
  {
    title: "Cấu trúc câu trong tiếng Anh | Ngữ Pháp Tiếng Anh Cơ Bản",
    url: "https://www.youtube.com/watch?v=CKgCahkAkQ8&list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe&index=1&pp=iAQB0gcJCQMKAYcqIYzv",
  },
  { title: "Động từ to be - Học Ngữ Pháp Tiếng Anh Cơ Bản", url: "https://www.youtube.com/watch?v=oZeiWAdEofM&list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe&index=2&t=2s&pp=iAQB0gcJCQMKAYcqIYzv" },
  { title: "Danh từ trong tiếng Anh | Ngữ Pháp Tiếng Anh Cơ Bản", url: "https://www.youtube.com/watch?v=5G7GrDxmYOc&list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe&index=3&pp=iAQB" },
  { title: "Động từ trong tiếng Anh | Ngữ Pháp Tiếng Anh Cơ Bản", url: "https://www.youtube.com/watch?v=Y09wrGAGTbg&list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe&index=4&pp=iAQB" },
  { title: "Tính từ trong tiếng Anh, chức năng , vị trí của tính từ trong tiếng Anh | ngữ pháp tiếng Anh cơ bản", url: "https://www.youtube.com/watch?v=5El-SNgw8Ts&list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe&index=5&pp=iAQB" },
  { title: "Trật tự tính từ trong tiếng Anh, công thứ OSASCOMP | ngữ pháp tiếng Anh cơ bản", url: "https://www.youtube.com/watch?v=lvHIHAPWu2I&list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe&index=6&pp=iAQB" },
  { title: "Tính từ đuôi ing và ed | ngữ pháp tiếng Anh cơ bản", url: "https://www.youtube.com/watch?v=_ugEMgm_E_k&list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe&index=7&pp=iAQB" },
  { title: "Trạng từ trong tiếng Anh, chức năng, vị trí của trạng từ | ngữ pháp tiếng Anh cơ bản", url: "https://www.youtube.com/watch?v=jJa56NnhsTQ&list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe&index=8&pp=iAQB" },
  { title: "Mạo từ trong tiếng Anh, mạo từ a an the | ngữ pháp tiếng Anh cơ bản", url: "https://www.youtube.com/watch?v=kYjwG4cRTy0&list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe&index=9&pp=iAQB" },
  { title: "Đại từ trong tiếng anh, đại từ nhân xưng | ngữ pháp tiếng Anh cơ bản", url: "https://www.youtube.com/watch?v=C3jNtyaEKtI&list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe&index=10&pp=iAQB" },
];

// Small realistic word pools to build flashcards (re-used and combined to create 20 per topic)
const WORD_POOL = [
  { word: "appointment", phonetic: "/əˈpɔɪntmənt/", pos: "n.", vi: "cuộc hẹn", example: "I have an appointment with the manager.", audio: "" },
  { word: "invoice", phonetic: "/ˈɪnvɔɪs/", pos: "n.", vi: "hóa đơn", example: "Please send the invoice by email.", audio: "" },
  { word: "deliver", phonetic: "/dɪˈlɪvər/", pos: "v.", vi: "giao hàng", example: "They will deliver the package tomorrow.", audio: "" },
  { word: "customer", phonetic: "/ˈkʌstəmər/", pos: "n.", vi: "khách hàng", example: "The customer is waiting at reception.", audio: "" },
  { word: "schedule", phonetic: "/ˈskedʒuːl/", pos: "v./n.", vi: "lịch trình, lên lịch", example: "We scheduled the meeting for Monday.", audio: "" },
  { word: "contract", phonetic: "/ˈkɒntrækt/", pos: "n.", vi: "hợp đồng", example: "The contract must be signed by both parties.", audio: "" },
  { word: "salary", phonetic: "/ˈsæləri/", pos: "n.", vi: "lương", example: "He received his salary today.", audio: "" },
  { word: "promotion", phonetic: "/prəˈməʊʃən/", pos: "n.", vi: "thăng chức", example: "She got a promotion last quarter.", audio: "" },
  { word: "deliverable", phonetic: "/dɪˈlɪvərəbl/", pos: "n.", vi: "sản phẩm giao nộp", example: "List all project deliverables.", audio: "" },
  { word: "deadline", phonetic: "/ˈdedlaɪn/", pos: "n.", vi: "hạn chót", example: "We must meet the deadline.", audio: "" },
  { word: "meeting", phonetic: "/ˈmiːtɪŋ/", pos: "n.", vi: "cuộc họp", example: "The meeting starts at 9 AM.", audio: "" },
  { word: "minutes", phonetic: "/ˈmɪnɪts/", pos: "n.", vi: "biên bản cuộc họp", example: "Please send the meeting minutes.", audio: "" },
  { word: "agenda", phonetic: "/əˈdʒendə/", pos: "n.", vi: "chương trình nghị sự", example: "Check the agenda before the meeting.", audio: "" },
  { word: "negotiation", phonetic: "/nɪˌɡəʊʃiˈeɪʃən/", pos: "n.", vi: "đàm phán", example: "The negotiation took several days.", audio: "" },
  { word: "feedback", phonetic: "/ˈfiːdbæk/", pos: "n.", vi: "phản hồi", example: "Please provide feedback on the draft.", audio: "" },
  { word: "proposal", phonetic: "/prəˈpəʊzəl/", pos: "n.", vi: "đề xuất", example: "Submit the proposal by Friday.", audio: "" },
  { word: "submit", phonetic: "/səbˈmɪt/", pos: "v.", vi: "nộp", example: "Please submit your report.", audio: "" },
  { word: "confirm", phonetic: "/kənˈfɜːm/", pos: "v.", vi: "xác nhận", example: "Can you confirm the appointment?", audio: "" },
  { word: "department", phonetic: "/dɪˈpɑːtmənt/", pos: "n.", vi: "phòng ban", example: "Contact the sales department.", audio: "" },
  { word: "representative", phonetic: "/ˌreprɪˈzentətɪv/", pos: "n.", vi: "đại diện", example: "A representative will call you.", audio: "" },
];

async function main() {
  await mongoose.connect(MONGO, { autoIndex: true });
  console.log("Connected to DB", MONGO);

  // Create 10 flashcard topics, each with 20 vocab (re-using and rotating WORD_POOL)
  const createdTopicIds: Types.ObjectId[] = [];
  for (let t = 0; t < 10; t++) {
    const title = `Seeded Flashcards Topic ${t + 1}`;
    const topic = await TopicVocabulary.create({
      title,
      description: `Bộ từ vựng ${t + 1} (seeded)`,
      tags: ["seed:extended", "vocab"],
      level: "B1",
      vocabularies_id: [],
      isCollaborator: false,
      isPublic: false,
      created_at: new Date(),
      created_by: DEFAULT_CREATOR_ID,
    } as any);

    const vocPayloads: any[] = [];
    for (let i = 0; i < 20; i++) {
      const poolItem = WORD_POOL[(t * 5 + i) % WORD_POOL.length];
      vocPayloads.push({
        word: poolItem.word + (i >= 10 ? `_${i}` : ""),
        phonetic: poolItem.phonetic,
        type: poolItem.pos,
        part_type: "listening",
        weight: 0,
        definition: poolItem.vi,
        examples: [{ en: poolItem.example, vi: poolItem.vi }],
        image: "",
        audio: poolItem.audio || "",
        tags: ["seed:extended"],
        notes: "",
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
    const createdVocs = await Vocabulary.insertMany(vocPayloads as any[]);
    topic.vocabularies_id = createdVocs.map((v: any) => v._id);
    await topic.save();
    createdTopicIds.push(topic._id as Types.ObjectId);
    console.log(`Created topic ${title} with ${createdVocs.length} vocs`);

    // Also create a FlashCardPlan for a fake user
    // Keep similar to generator behavior
    // (Skip: user can generate plans via generator; we only create topics here)
  }

  // Create quizzes: 10 quizzes, each with 5 questions
  for (let qn = 0; qn < 10; qn++) {
    const qTitle = `Seeded Quiz Topic ${qn + 1}`;
    const quiz = await Quiz.create({
      title: qTitle,
      question_ids: [],
      part_type: 5,
      level: "B1",
      status: "APPROVED",
      planned_completion_time: 10,
      weight: 0.1,
      created_at: new Date(),
      created_by: DEFAULT_CREATOR_ID,
    } as any);

    const qPayloads: any[] = [];
    for (let i = 0; i < 5; i++) {
      const base = WORD_POOL[(qn * 3 + i) % WORD_POOL.length];
      const choices = [
        `The ${base.word} is due next week.`,
        `We will cancel the ${base.word}.`,
        `Please review the ${base.word} before sending.`,
        `The ${base.word} has been approved.`,
      ];
      const correct = 2; // choose index 2 as correct for predictability
      qPayloads.push({
        name: `${qTitle} - Q${i + 1}`,
        textQuestion: `Choose the sentence that best fits the context for '${base.word}'.`,
        choices: { A: choices[0], B: choices[1], C: choices[2], D: choices[3] },
        correctAnswer: String.fromCharCode(65 + correct),
        explanation: `C is correct because it asks to review the ${base.word}.`,
        tags: ["seed:extended"],
        planned_time: 30,
        created_at: new Date(),
        created_by: DEFAULT_CREATOR_ID,
      });
    }
    const createdQs = await Question.insertMany(qPayloads as any[]);
    quiz.question_ids = createdQs.map((c: any) => c._id);
    await quiz.save();
    console.log(`Created quiz ${qTitle} with ${createdQs.length} questions`);
  }

  // Create video lessons from provided list (with Media + LessonSection)
  for (const v of VIDEO_LESSONS) {
    try {
      const media = await Media.create({
        topic: v.title,
        url: v.url,
        type: "video",
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      const lesson = await Lesson.create({
        part_type: 0,
        topic: [v.title],
        title: v.title,
        status: "APPROVED",
        summary: `Video lesson seeded: ${v.title}`,
        planned_completion_time: 15,
        weight: 0.1,
        sections_id: [],
        created_at: new Date(),
        created_by: DEFAULT_CREATOR_ID,
        updated_at: new Date(),
      } as any);
      const section = await LessonSection.create({
        lesson_id: lesson._id,
        order: 0,
        title: "Video",
        type: "media",
        medias_id: [media._id],
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      lesson.sections_id = [section._id as Types.ObjectId];
      await lesson.save();
      console.log(`Created lesson '${v.title}' with media`);
    } catch (err) {
      console.warn("Failed to create video lesson", v.title, err);
    }
  }

  console.log("Seeding complete. Disconnecting.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
