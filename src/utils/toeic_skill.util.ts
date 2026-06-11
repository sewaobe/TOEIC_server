export type ToeicSkillGroup = "basic" | "core" | "advanced";

export interface ToeicSkillDefinition {
  key: string;
  label_vi: string;
  part_type: number;
  skill_group: ToeicSkillGroup;
  aliases: string[];
}

export interface NormalizedToeicSkill {
  key: string;
  label_vi: string;
  raw_tag: string;
  part_type: number;
  skill_group: ToeicSkillGroup;
}

const withPartAlias = (partType: number, aliases: string[]): string[] => {
  const expanded = aliases.flatMap((alias) => [
    alias,
    `[Part ${partType}] ${alias}`,
  ]);

  return Array.from(new Set(expanded));
};

// key là mã ổn định để scheduler/DB dùng.
// label_vi là tên tiếng Việt để sau này FE hiển thị.
// skill_group là nhóm sư phạm hiện tại: basic/core/advanced.
export const TOEIC_SKILL_DEFINITIONS: ToeicSkillDefinition[] = [
  // Part 1 – Mô tả tranh
  {
    key: "part1_people_photo",
    label_vi: "Tranh tả người",
    part_type: 1,
    skill_group: "basic",
    aliases: withPartAlias(1, ["Tranh tả người"]),
  },
  {
    key: "part1_object_photo",
    label_vi: "Tranh tả vật",
    part_type: 1,
    skill_group: "basic",
    aliases: withPartAlias(1, ["Tranh tả vật"]),
  },

  // Part 2 – Hỏi đáp ngắn
  {
    key: "part2_what_question",
    label_vi: "Câu hỏi WHAT",
    part_type: 2,
    skill_group: "basic",
    aliases: withPartAlias(2, ["Câu hỏi WHAT"]),
  },
  {
    key: "part2_who_question",
    label_vi: "Câu hỏi WHO",
    part_type: 2,
    skill_group: "basic",
    aliases: withPartAlias(2, ["Câu hỏi WHO"]),
  },
  {
    key: "part2_where_question",
    label_vi: "Câu hỏi WHERE",
    part_type: 2,
    skill_group: "basic",
    aliases: withPartAlias(2, ["Câu hỏi WHERE"]),
  },
  {
    key: "part2_when_question",
    label_vi: "Câu hỏi WHEN",
    part_type: 2,
    skill_group: "basic",
    aliases: withPartAlias(2, ["Câu hỏi WHEN"]),
  },
  {
    key: "part2_how_question",
    label_vi: "Câu hỏi HOW",
    part_type: 2,
    skill_group: "basic",
    aliases: withPartAlias(2, ["Câu hỏi HOW"]),
  },
  {
    key: "part2_why_question",
    label_vi: "Câu hỏi WHY",
    part_type: 2,
    skill_group: "core",
    aliases: withPartAlias(2, ["Câu hỏi WHY"]),
  },
  {
    key: "part2_yes_no_question",
    label_vi: "Câu hỏi YES/NO",
    part_type: 2,
    skill_group: "basic",
    aliases: withPartAlias(2, ["Câu hỏi YES/NO", "Câu hỏi Yes/No"]),
  },
  {
    key: "part2_tag_question",
    label_vi: "Câu hỏi đuôi",
    part_type: 2,
    skill_group: "core",
    aliases: withPartAlias(2, ["Câu hỏi đuôi"]),
  },
  {
    key: "part2_choice_question",
    label_vi: "Câu hỏi lựa chọn",
    part_type: 2,
    skill_group: "basic",
    aliases: withPartAlias(2, ["Câu hỏi lựa chọn"]),
  },
  {
    key: "part2_request_suggestion",
    label_vi: "Câu yêu cầu, đề nghị",
    part_type: 2,
    skill_group: "core",
    aliases: withPartAlias(2, [
      "Câu yêu cầu, đề nghị",
      "Câu hỏi đề nghị / yêu cầu",
      "Câu hỏi đề nghị",
      "Câu hỏi yêu cầu",
    ]),
  },
  {
    key: "part2_statement_response",
    label_vi: "Câu trần thuật",
    part_type: 2,
    skill_group: "advanced",
    aliases: withPartAlias(2, ["Câu trần thuật"]),
  },

  // Part 3 – Hội thoại ngắn
  {
    key: "part3_main_idea_purpose",
    label_vi: "Câu hỏi về chủ đề, mục đích",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, ["Câu hỏi về chủ đề, mục đích"]),
  },
  {
    key: "part3_speaker_identity",
    label_vi: "Câu hỏi về danh tính người nói",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, ["Câu hỏi về danh tính người nói"]),
  },
  {
    key: "part3_conversation_detail",
    label_vi: "Câu hỏi về chi tiết cuộc hội thoại",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, [
      "Câu hỏi về chi tiết cuộc hội thoại",
      "Câu hỏi về chi tiết",
    ]),
  },
  {
    key: "part3_future_action",
    label_vi: "Câu hỏi về hành động tương lai",
    part_type: 3,
    skill_group: "advanced",
    aliases: withPartAlias(3, [
      "Câu hỏi về hành động tương lai",
      "Hành động tiếp theo",
    ]),
  },
  {
    key: "part3_graphic",
    label_vi: "Câu hỏi kết hợp bảng biểu",
    part_type: 3,
    skill_group: "advanced",
    aliases: withPartAlias(3, [
      "Câu hỏi kết hợp bảng biểu",
      "Câu hỏi có hình ảnh",
      "Câu hỏi bảng biểu",
    ]),
  },
  {
    key: "part3_implied_meaning",
    label_vi: "Câu hỏi về hàm ý câu nói",
    part_type: 3,
    skill_group: "advanced",
    aliases: withPartAlias(3, ["Câu hỏi về hàm ý câu nói"]),
  },
  {
    key: "part3_topic_company_general_office_work",
    label_vi: "Chủ đề: Company - General Office Work",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, ["Chủ đề: Company - General Office Work"]),
  },
  {
    key: "part3_topic_company_personnel",
    label_vi: "Chủ đề: Company - Personnel",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, ["Chủ đề: Company - Personnel"]),
  },
  {
    key: "part3_topic_company_event_project",
    label_vi: "Chủ đề: Company - Event, Project",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, ["Chủ đề: Company - Event, Project"]),
  },
  {
    key: "part3_topic_company_facility",
    label_vi: "Chủ đề: Company - Facility",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, ["Chủ đề: Company - Facility"]),
  },
  {
    key: "part3_topic_shopping_service",
    label_vi: "Chủ đề: Shopping, Service",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, ["Chủ đề: Shopping, Service"]),
  },
  {
    key: "part3_topic_order_delivery",
    label_vi: "Chủ đề: Order, delivery",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, ["Chủ đề: Order, delivery"]),
  },
  {
    key: "part3_topic_transportation",
    label_vi: "Chủ đề: Transportation",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, ["Chủ đề: Transportation"]),
  },
  {
    key: "part3_request_suggestion",
    label_vi: "Câu hỏi về yêu cầu, gợi ý",
    part_type: 3,
    skill_group: "advanced",
    aliases: withPartAlias(3, ["Câu hỏi về yêu cầu, gợi ý"]),
  },

  // Part 4 – Bài nói ngắn
  {
    key: "part4_main_idea_purpose",
    label_vi: "Câu hỏi về chủ đề, mục đích",
    part_type: 4,
    skill_group: "core",
    aliases: withPartAlias(4, ["Câu hỏi về chủ đề, mục đích"]),
  },
  {
    key: "part4_identity_location",
    label_vi: "Câu hỏi về danh tính, địa điểm",
    part_type: 4,
    skill_group: "core",
    aliases: withPartAlias(4, ["Câu hỏi về danh tính, địa điểm"]),
  },
  {
    key: "part4_detail",
    label_vi: "Câu hỏi về chi tiết",
    part_type: 4,
    skill_group: "core",
    aliases: withPartAlias(4, ["Câu hỏi về chi tiết"]),
  },
  {
    key: "part4_future_action",
    label_vi: "Câu hỏi về hành động tương lai",
    part_type: 4,
    skill_group: "advanced",
    aliases: withPartAlias(4, [
      "Câu hỏi về hành động tương lai",
      "Hành động tiếp theo",
    ]),
  },
  {
    key: "part4_graphic",
    label_vi: "Câu hỏi kết hợp bảng biểu",
    part_type: 4,
    skill_group: "advanced",
    aliases: withPartAlias(4, [
      "Câu hỏi kết hợp bảng biểu",
      "Câu hỏi có hình ảnh",
      "Câu hỏi bảng biểu",
    ]),
  },
  {
    key: "part4_implied_meaning",
    label_vi: "Câu hỏi về hàm ý câu nói",
    part_type: 4,
    skill_group: "advanced",
    aliases: withPartAlias(4, ["Câu hỏi về hàm ý câu nói"]),
  },
  {
    key: "part4_type_telephone_message",
    label_vi: "Dạng bài: Telephone message - Tin nhắn thoại",
    part_type: 4,
    skill_group: "core",
    aliases: withPartAlias(4, ["Dạng bài: Telephone message - Tin nhắn thoại"]),
  },
  {
    key: "part4_type_announcement",
    label_vi: "Dạng bài: Announcement - Thông báo",
    part_type: 4,
    skill_group: "core",
    aliases: withPartAlias(4, ["Dạng bài: Announcement - Thông báo"]),
  },
  {
    key: "part4_type_news_report_broadcast",
    label_vi: "Dạng bài: News report, Broadcast - Bản tin",
    part_type: 4,
    skill_group: "core",
    aliases: withPartAlias(4, ["Dạng bài: News report, Broadcast - Bản tin"]),
  },
  {
    key: "part4_type_talk",
    label_vi: "Dạng bài: Talk - Bài phát biểu, diễn văn",
    part_type: 4,
    skill_group: "core",
    aliases: withPartAlias(4, ["Dạng bài: Talk - Bài phát biểu, diễn văn"]),
  },
  {
    key: "part4_type_meeting_excerpt",
    label_vi: "Dạng bài: Excerpt from a meeting - Trích dẫn từ buổi họp",
    part_type: 4,
    skill_group: "advanced",
    aliases: withPartAlias(4, [
      "Dạng bài: Excerpt from a meeting - Trích dẫn từ buổi họp",
    ]),
  },
  {
    key: "part4_request_suggestion",
    label_vi: "Câu hỏi yêu cầu, gợi ý",
    part_type: 4,
    skill_group: "advanced",
    aliases: withPartAlias(4, ["Câu hỏi yêu cầu, gợi ý"]),
  },

  // Part 5 – Hoàn thành câu
  {
    key: "part5_word_form_question",
    label_vi: "Câu hỏi từ loại",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, ["Câu hỏi từ loại", "Từ loại", "Word form"]),
  },
  {
    key: "part5_grammar_question",
    label_vi: "Câu hỏi ngữ pháp",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, ["Câu hỏi ngữ pháp", "Ngữ pháp"]),
  },
  {
    key: "part5_vocabulary_question",
    label_vi: "Câu hỏi từ vựng",
    part_type: 5,
    skill_group: "core",
    aliases: withPartAlias(5, ["Câu hỏi từ vựng", "Từ vựng", "Vocabulary"]),
  },
  {
    key: "part5_noun",
    label_vi: "Danh từ",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, ["Danh từ", "Noun"]),
  },
  {
    key: "part5_pronoun",
    label_vi: "Đại từ",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, ["Đại từ", "Pronoun"]),
  },
  {
    key: "part5_adjective",
    label_vi: "Tính từ",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, ["Tính từ", "Adjective"]),
  },
  {
    key: "part5_tense",
    label_vi: "Thì",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, ["Thì", "Thì động từ", "Tense", "Verb tense"]),
  },
  {
    key: "part5_adverb",
    label_vi: "Trạng từ",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, ["Trạng từ", "Adverb"]),
  },
  {
    key: "part5_to_infinitive",
    label_vi: "Động từ nguyên mẫu có to",
    part_type: 5,
    skill_group: "core",
    aliases: withPartAlias(5, [
      "Động từ nguyên mẫu có to",
      "To V",
      "Infinitive",
    ]),
  },
  {
    key: "part5_preposition",
    label_vi: "Giới từ",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, ["Giới từ", "Preposition"]),
  },
  {
    key: "part5_conjunction",
    label_vi: "Liên từ",
    part_type: 5,
    skill_group: "core",
    aliases: withPartAlias(5, ["Liên từ", "Conjunction", "Từ nối"]),
  },
  {
    key: "part5_relative_clause",
    label_vi: "Mệnh đề quan hệ",
    part_type: 5,
    skill_group: "advanced",
    aliases: withPartAlias(5, ["Mệnh đề quan hệ", "Relative clause"]),
  },
  {
    key: "part5_comparison",
    label_vi: "Cấu trúc so sánh",
    part_type: 5,
    skill_group: "core",
    aliases: withPartAlias(5, [
      "Cấu trúc so sánh",
      "So sánh",
      "Comparison",
      "Comparative",
      "Superlative",
    ]),
  },

  // Part 6 – Hoàn thành đoạn văn
  {
    key: "part6_noun",
    label_vi: "Danh từ",
    part_type: 6,
    skill_group: "basic",
    aliases: withPartAlias(6, ["Danh từ", "Noun"]),
  },
  {
    key: "part6_adjective",
    label_vi: "Tính từ",
    part_type: 6,
    skill_group: "basic",
    aliases: withPartAlias(6, ["Tính từ", "Adjective"]),
  },
  {
    key: "part6_tense",
    label_vi: "Thì",
    part_type: 6,
    skill_group: "basic",
    aliases: withPartAlias(6, ["Thì", "Thì động từ", "Tense"]),
  },
  {
    key: "part6_voice",
    label_vi: "Thể",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, ["Thể", "Voice"]),
  },
  {
    key: "part6_participle_structure",
    label_vi: "Phân từ và Cấu trúc phân từ",
    part_type: 6,
    skill_group: "advanced",
    aliases: withPartAlias(6, [
      "Phân từ và Cấu trúc phân từ",
      "Phân từ",
      "Participle",
    ]),
  },
  {
    key: "part6_preposition",
    label_vi: "Giới từ",
    part_type: 6,
    skill_group: "basic",
    aliases: withPartAlias(6, ["Giới từ", "Preposition"]),
  },
  {
    key: "part6_conjunction",
    label_vi: "Liên từ",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, ["Liên từ", "Conjunction", "Từ nối"]),
  },
  {
    key: "part6_word_form_question",
    label_vi: "Câu hỏi từ loại",
    part_type: 6,
    skill_group: "basic",
    aliases: withPartAlias(6, ["Câu hỏi từ loại", "Từ loại", "Word form"]),
  },
  {
    key: "part6_grammar_question",
    label_vi: "Câu hỏi ngữ pháp",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, ["Câu hỏi ngữ pháp", "Ngữ pháp"]),
  },
  {
    key: "part6_vocabulary_question",
    label_vi: "Câu hỏi từ vựng",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, ["Câu hỏi từ vựng", "Từ vựng", "Vocabulary"]),
  },
  {
    key: "part6_sentence_insertion",
    label_vi: "Câu hỏi điền câu vào đoạn văn",
    part_type: 6,
    skill_group: "advanced",
    aliases: withPartAlias(6, [
      "Câu hỏi điền câu vào đoạn văn",
      "Điền câu vào đoạn văn",
      "Sentence insertion",
    ]),
  },
  {
    key: "part6_form_email_letter",
    label_vi: "Hình thức: Thư điện tử / Thư tay (Email / Letter)",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, [
      "Hình thức: Thư điện tử / Thư tay (Email / Letter)",
    ]),
  },
  {
    key: "part6_form_notice_announcement",
    label_vi: "Hình thức: Thông báo / Văn bản hướng dẫn (Notice / Announcement)",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, [
      "Hình thức: Thông báo / Văn bản hướng dẫn (Notice / Announcement)",
    ]),
  },
  {
    key: "part6_form_advertisement",
    label_vi: "Hình thức: Quảng cáo (Advertisement)",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, ["Hình thức: Quảng cáo (Advertisement)"]),
  },
  {
    key: "part6_form_web_page",
    label_vi: "Hình thức: Trang web (Web page)",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, ["Hình thức: Trang web (Web page)"]),
  },
  {
    key: "part6_form_article_review_testimonial",
    label_vi: "Hình thức: Bài viết / Đánh giá / Chứng thực (Article / Review / Testimonial)",
    part_type: 6,
    skill_group: "advanced",
    aliases: withPartAlias(6, [
      "Hình thức: Bài viết / Đánh giá / Chứng thực (Article / Review / Testimonial)",
    ]),
  },
  {
    key: "part6_form_information_instructions",
    label_vi: "Hình thức: Thông tin / Hướng dẫn (Information / Instructions)",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, [
      "Hình thức: Thông tin / Hướng dẫn (Information / Instructions)",
    ]),
  },

  // Part 7 – Đọc hiểu
  {
    key: "part7_information",
    label_vi: "Câu hỏi tìm thông tin",
    part_type: 7,
    skill_group: "core",
    aliases: withPartAlias(7, [
      "Câu hỏi tìm thông tin",
      "Tìm thông tin",
      "Thông tin chi tiết",
    ]),
  },
  {
    key: "part7_negative_detail",
    label_vi: "Câu hỏi tìm chi tiết sai",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, [
      "Câu hỏi tìm chi tiết sai",
      "Câu hỏi NOT",
      "Câu hỏi đúng sai",
    ]),
  },
  {
    key: "part7_main_idea_purpose",
    label_vi: "Câu hỏi về chủ đề, mục đích",
    part_type: 7,
    skill_group: "core",
    aliases: withPartAlias(7, ["Câu hỏi về chủ đề, mục đích"]),
  },
  {
    key: "part7_inference",
    label_vi: "Câu hỏi suy luận",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, ["Câu hỏi suy luận", "Suy luận"]),
  },
  {
    key: "part7_sentence_insertion",
    label_vi: "Câu hỏi điền câu",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, [
      "Câu hỏi điền câu",
      "Câu hỏi điền câu vào đoạn văn",
      "Sentence insertion",
    ]),
  },
  {
    key: "part7_single_passage",
    label_vi: "Cấu trúc: một đoạn",
    part_type: 7,
    skill_group: "core",
    aliases: withPartAlias(7, ["Cấu trúc: một đoạn"]),
  },
  {
    key: "part7_multiple_passages",
    label_vi: "Cấu trúc: nhiều đoạn",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, [
      "Cấu trúc: nhiều đoạn",
      "Nhiều đoạn văn",
      "Liên văn bản",
      "Double passage",
      "Triple passage",
    ]),
  },
  {
    key: "part7_type_email_letter",
    label_vi: "Dạng bài: Email / Letter – Thư điện tử / Thư tay",
    part_type: 7,
    skill_group: "core",
    aliases: withPartAlias(7, [
      "Dạng bài: Email / Letter – Thư điện tử / Thư tay",
    ]),
  },
  {
    key: "part7_type_form",
    label_vi: "Dạng bài: Form – Đơn từ / Biểu mẫu",
    part_type: 7,
    skill_group: "core",
    aliases: withPartAlias(7, ["Dạng bài: Form – Đơn từ / Biểu mẫu"]),
  },
  {
    key: "part7_type_article_review",
    label_vi: "Dạng bài: Article / Review – Bài báo / Bài đánh giá",
    part_type: 7,
    skill_group: "core",
    aliases: withPartAlias(7, [
      "Dạng bài: Article / Review – Bài báo / Bài đánh giá",
    ]),
  },
  {
    key: "part7_type_advertisement",
    label_vi: "Dạng bài: Advertisement – Quảng cáo",
    part_type: 7,
    skill_group: "core",
    aliases: withPartAlias(7, ["Dạng bài: Advertisement – Quảng cáo"]),
  },
  {
    key: "part7_type_announcement",
    label_vi: "Dạng bài: Announcement – Thông báo",
    part_type: 7,
    skill_group: "core",
    aliases: withPartAlias(7, ["Dạng bài: Announcement – Thông báo"]),
  },
  {
    key: "part7_type_text_message_chain",
    label_vi: "Dạng bài: Text message chain – Chuỗi tin nhắn",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, [
      "Dạng bài: Text message chain – Chuỗi tin nhắn",
    ]),
  },
  {
    key: "part7_synonym",
    label_vi: "Câu hỏi tìm từ đồng nghĩa",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, ["Câu hỏi tìm từ đồng nghĩa"]),
  },
  {
    key: "part7_implied_meaning",
    label_vi: "Câu hỏi về hàm ý câu nói",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, ["Câu hỏi về hàm ý câu nói"]),
  },
];

const normalizeText = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");

const stripPartPrefix = (value: string): string =>
  value.replace(/^\s*\[Part\s+\d+\]\s*/i, "").trim();

const matchesDefinition = (
  definition: ToeicSkillDefinition,
  rawTag: string
): boolean => {
  const normalizedRaw = normalizeText(rawTag);
  const normalizedWithoutPart = normalizeText(stripPartPrefix(rawTag));

  return definition.aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    return (
      normalizedAlias === normalizedRaw ||
      normalizedAlias === normalizedWithoutPart
    );
  });
};

export const normalizeToeicSkillTag = (
  rawTag: string,
  partType?: number
): NormalizedToeicSkill | null => {
  const candidates = TOEIC_SKILL_DEFINITIONS.filter((definition) =>
    matchesDefinition(definition, rawTag)
  );

  const matched = partType
    ? candidates.find((definition) => definition.part_type === partType)
    : candidates.length === 1
      ? candidates[0]
      : undefined;

  if (!matched) return null;

  return {
    key: matched.key,
    label_vi: matched.label_vi,
    raw_tag: rawTag,
    part_type: matched.part_type,
    skill_group: matched.skill_group,
  };
};

export const getToeicSkillLabelVi = (
  skillKey: string,
  partType?: number
): string | undefined => {
  const matched = TOEIC_SKILL_DEFINITIONS.find(
    (definition) =>
      definition.key === skillKey &&
      (partType === undefined || definition.part_type === partType)
  );

  return matched?.label_vi;
};

export const normalizeToeicSkillTags = (
  rawTags: string[],
  partType?: number
): NormalizedToeicSkill[] => {
  // Tag chưa nằm trong taxonomy thì bỏ qua, không xem là lỗi.
  return rawTags
    .map((rawTag) => normalizeToeicSkillTag(rawTag, partType))
    .filter((skill): skill is NormalizedToeicSkill => Boolean(skill));
};
