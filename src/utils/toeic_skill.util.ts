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
  // Part 1
  {
    key: "part1_people_photo",
    label_vi: "Tranh tả người",
    part_type: 1,
    skill_group: "basic",
    aliases: withPartAlias(1, [
      "Tranh tả người",
      "Mô tả người",
      "Người",
      "Hành động của người",
    ]),
  },
  {
    key: "part1_object_photo",
    label_vi: "Tranh tả vật",
    part_type: 1,
    skill_group: "basic",
    aliases: withPartAlias(1, [
      "Tranh tả vật",
      "Mô tả vật",
      "Đồ vật",
      "Vật thể",
    ]),
  },
  {
    key: "part1_scene_photo",
    label_vi: "Tranh tả cảnh",
    part_type: 1,
    skill_group: "core",
    aliases: withPartAlias(1, [
      "Tranh tả cảnh",
      "Mô tả cảnh",
      "Bối cảnh",
      "Khung cảnh",
    ]),
  },
  {
    key: "part1_location_position",
    label_vi: "Vị trí / địa điểm",
    part_type: 1,
    skill_group: "core",
    aliases: withPartAlias(1, [
      "Vị trí",
      "Địa điểm",
      "Vị trí đồ vật",
      "Giới từ chỉ vị trí",
    ]),
  },

  // Part 2
  {
    key: "part2_wh_question",
    label_vi: "Câu hỏi WH",
    part_type: 2,
    skill_group: "basic",
    aliases: withPartAlias(2, [
      "Câu hỏi WH",
      "Câu hỏi WHAT",
      "Câu hỏi WHO",
      "Câu hỏi WHERE",
      "Câu hỏi WHEN",
      "Câu hỏi HOW",
      "Câu hỏi WHY",
    ]),
  },
  {
    key: "part2_yes_no_question",
    label_vi: "Câu hỏi Yes/No",
    part_type: 2,
    skill_group: "basic",
    aliases: withPartAlias(2, [
      "Câu hỏi Yes/No",
      "Câu hỏi YES/NO",
      "Yes/No question",
    ]),
  },
  {
    key: "part2_choice_question",
    label_vi: "Câu hỏi lựa chọn",
    part_type: 2,
    skill_group: "basic",
    aliases: withPartAlias(2, [
      "Câu hỏi lựa chọn",
      "Câu hỏi chọn lựa",
      "Choice question",
    ]),
  },
  {
    key: "part2_tag_question",
    label_vi: "Câu hỏi đuôi",
    part_type: 2,
    skill_group: "core",
    aliases: withPartAlias(2, [
      "Câu hỏi đuôi",
      "Tag question",
    ]),
  },
  {
    key: "part2_request_suggestion",
    label_vi: "Câu hỏi đề nghị / yêu cầu",
    part_type: 2,
    skill_group: "core",
    aliases: withPartAlias(2, [
      "Câu hỏi đề nghị / yêu cầu",
      "Câu hỏi đề nghị",
      "Câu hỏi yêu cầu",
      "Đề nghị / yêu cầu",
      "Request / Suggestion",
    ]),
  },
  {
    key: "part2_indirect_question",
    label_vi: "Câu hỏi gián tiếp",
    part_type: 2,
    skill_group: "advanced",
    aliases: withPartAlias(2, [
      "Câu hỏi gián tiếp",
      "Indirect question",
    ]),
  },
  {
    key: "part2_statement_response",
    label_vi: "Câu trần thuật",
    part_type: 2,
    skill_group: "advanced",
    aliases: withPartAlias(2, [
      "Câu trần thuật",
      "Statement response",
      "Phản hồi câu trần thuật",
    ]),
  },

  // Part 3
  {
    key: "part3_main_idea_purpose",
    label_vi: "Chủ đề / mục đích",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, [
      "Câu hỏi về chủ đề, mục đích",
      "Chủ đề",
      "Mục đích",
      "Main idea",
      "Purpose",
    ]),
  },
  {
    key: "part3_detail",
    label_vi: "Chi tiết",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, [
      "Câu hỏi về chi tiết",
      "Chi tiết",
      "Detail",
    ]),
  },
  {
    key: "part3_speaker_listener",
    label_vi: "Người nói / người nghe",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, [
      "Người nói",
      "Người nghe",
      "Vai trò người nói",
      "Speaker",
      "Listener",
    ]),
  },
  {
    key: "part3_location_context",
    label_vi: "Địa điểm / ngữ cảnh",
    part_type: 3,
    skill_group: "core",
    aliases: withPartAlias(3, [
      "Địa điểm",
      "Ngữ cảnh",
      "Bối cảnh",
      "Location",
      "Context",
    ]),
  },
  {
    key: "part3_next_action",
    label_vi: "Hành động tiếp theo",
    part_type: 3,
    skill_group: "advanced",
    aliases: withPartAlias(3, [
      "Hành động tiếp theo",
      "Việc sẽ làm tiếp theo",
      "Next action",
    ]),
  },
  {
    key: "part3_inference",
    label_vi: "Suy luận",
    part_type: 3,
    skill_group: "advanced",
    aliases: withPartAlias(3, [
      "Câu hỏi suy luận",
      "Suy luận",
      "Inference",
    ]),
  },
  {
    key: "part3_graphic",
    label_vi: "Câu hỏi có hình ảnh / bảng biểu",
    part_type: 3,
    skill_group: "advanced",
    aliases: withPartAlias(3, [
      "Câu hỏi có hình ảnh",
      "Câu hỏi bảng biểu",
      "Graphic",
      "Visual information",
    ]),
  },

  // Part 4
  {
    key: "part4_main_idea_purpose",
    label_vi: "Chủ đề / mục đích",
    part_type: 4,
    skill_group: "core",
    aliases: withPartAlias(4, [
      "Câu hỏi về chủ đề, mục đích",
      "Chủ đề",
      "Mục đích",
      "Main idea",
      "Purpose",
    ]),
  },
  {
    key: "part4_detail",
    label_vi: "Chi tiết",
    part_type: 4,
    skill_group: "core",
    aliases: withPartAlias(4, [
      "Câu hỏi về chi tiết",
      "Chi tiết",
      "Detail",
    ]),
  },
  {
    key: "part4_speaker",
    label_vi: "Người nói / vai trò",
    part_type: 4,
    skill_group: "core",
    aliases: withPartAlias(4, [
      "Người nói",
      "Vai trò người nói",
      "Speaker",
      "Occupation",
      "Role",
    ]),
  },
  {
    key: "part4_location_context",
    label_vi: "Địa điểm / ngữ cảnh",
    part_type: 4,
    skill_group: "core",
    aliases: withPartAlias(4, [
      "Địa điểm",
      "Ngữ cảnh",
      "Bối cảnh",
      "Location",
      "Context",
    ]),
  },
  {
    key: "part4_next_action",
    label_vi: "Hành động tiếp theo",
    part_type: 4,
    skill_group: "advanced",
    aliases: withPartAlias(4, [
      "Hành động tiếp theo",
      "Việc sẽ làm tiếp theo",
      "Next action",
    ]),
  },
  {
    key: "part4_inference",
    label_vi: "Suy luận",
    part_type: 4,
    skill_group: "advanced",
    aliases: withPartAlias(4, [
      "Câu hỏi suy luận",
      "Suy luận",
      "Inference",
    ]),
  },
  {
    key: "part4_graphic",
    label_vi: "Câu hỏi có hình ảnh / bảng biểu",
    part_type: 4,
    skill_group: "advanced",
    aliases: withPartAlias(4, [
      "Câu hỏi có hình ảnh",
      "Câu hỏi bảng biểu",
      "Graphic",
      "Visual information",
    ]),
  },

  // Part 5
  {
    key: "part5_word_form",
    label_vi: "Từ loại",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, [
      "Từ loại",
      "Câu hỏi từ loại",
      "Word form",
      "Parts of speech",
    ]),
  },
  {
    key: "part5_vocabulary",
    label_vi: "Từ vựng",
    part_type: 5,
    skill_group: "core",
    aliases: withPartAlias(5, [
      "Từ vựng",
      "Câu hỏi từ vựng",
      "Vocabulary",
    ]),
  },
  {
    key: "part5_verb_tense",
    label_vi: "Thì động từ",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, [
      "Thì động từ",
      "Thì",
      "Tense",
      "Verb tense",
    ]),
  },
  {
    key: "part5_subject_verb_agreement",
    label_vi: "Sự hòa hợp chủ ngữ - động từ",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, [
      "Sự hòa hợp chủ ngữ - động từ",
      "Hòa hợp chủ ngữ động từ",
      "Subject verb agreement",
    ]),
  },
  {
    key: "part5_preposition",
    label_vi: "Giới từ",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, [
      "Giới từ",
      "Preposition",
    ]),
  },
  {
    key: "part5_conjunction",
    label_vi: "Liên từ",
    part_type: 5,
    skill_group: "core",
    aliases: withPartAlias(5, [
      "Liên từ",
      "Conjunction",
      "Từ nối",
    ]),
  },
  {
    key: "part5_pronoun",
    label_vi: "Đại từ",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, [
      "Đại từ",
      "Pronoun",
    ]),
  },
  {
    key: "part5_adjective_adverb",
    label_vi: "Tính từ / trạng từ",
    part_type: 5,
    skill_group: "basic",
    aliases: withPartAlias(5, [
      "Tính từ / trạng từ",
      "Tính từ",
      "Trạng từ",
      "Adjective",
      "Adverb",
    ]),
  },
  {
    key: "part5_comparison",
    label_vi: "So sánh",
    part_type: 5,
    skill_group: "core",
    aliases: withPartAlias(5, [
      "So sánh",
      "Cấp so sánh",
      "Comparison",
      "Comparative",
      "Superlative",
    ]),
  },
  {
    key: "part5_passive_voice",
    label_vi: "Câu bị động",
    part_type: 5,
    skill_group: "core",
    aliases: withPartAlias(5, [
      "Câu bị động",
      "Bị động",
      "Passive voice",
    ]),
  },
  {
    key: "part5_infinitive_gerund",
    label_vi: "To V / V-ing",
    part_type: 5,
    skill_group: "core",
    aliases: withPartAlias(5, [
      "To V / V-ing",
      "To V",
      "V-ing",
      "Gerund",
      "Infinitive",
    ]),
  },
  {
    key: "part5_participle",
    label_vi: "Phân từ",
    part_type: 5,
    skill_group: "advanced",
    aliases: withPartAlias(5, [
      "Phân từ",
      "Hiện tại phân từ",
      "Quá khứ phân từ",
      "Participle",
    ]),
  },
  {
    key: "part5_relative_clause",
    label_vi: "Mệnh đề quan hệ",
    part_type: 5,
    skill_group: "advanced",
    aliases: withPartAlias(5, [
      "Mệnh đề quan hệ",
      "Relative clause",
    ]),
  },
  {
    key: "part5_conditional",
    label_vi: "Câu điều kiện",
    part_type: 5,
    skill_group: "advanced",
    aliases: withPartAlias(5, [
      "Câu điều kiện",
      "Điều kiện",
      "Conditional",
    ]),
  },
  {
    key: "part5_clause_structure",
    label_vi: "Cấu trúc câu / mệnh đề",
    part_type: 5,
    skill_group: "advanced",
    aliases: withPartAlias(5, [
      "Cấu trúc câu",
      "Mệnh đề",
      "Clause",
      "Sentence structure",
    ]),
  },

  // Part 6
  {
    key: "part6_word_form",
    label_vi: "Từ loại",
    part_type: 6,
    skill_group: "basic",
    aliases: withPartAlias(6, [
      "Từ loại",
      "Câu hỏi từ loại",
      "Word form",
    ]),
  },
  {
    key: "part6_vocabulary",
    label_vi: "Từ vựng theo ngữ cảnh",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, [
      "Từ vựng",
      "Từ vựng theo ngữ cảnh",
      "Vocabulary",
      "Context vocabulary",
    ]),
  },
  {
    key: "part6_grammar",
    label_vi: "Ngữ pháp theo ngữ cảnh",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, [
      "Ngữ pháp",
      "Ngữ pháp theo ngữ cảnh",
      "Grammar",
      "Context grammar",
    ]),
  },
  {
    key: "part6_sentence_insertion",
    label_vi: "Điền câu vào đoạn văn",
    part_type: 6,
    skill_group: "advanced",
    aliases: withPartAlias(6, [
      "Câu hỏi điền câu vào đoạn văn",
      "Điền câu vào đoạn văn",
      "Sentence insertion",
    ]),
  },
  {
    key: "part6_context_cohesion",
    label_vi: "Liên kết ngữ cảnh",
    part_type: 6,
    skill_group: "advanced",
    aliases: withPartAlias(6, [
      "Liên kết ngữ cảnh",
      "Liên kết đoạn văn",
      "Mạch văn",
      "Context cohesion",
      "Cohesion",
    ]),
  },
  {
    key: "part6_text_completion",
    label_vi: "Hoàn thành đoạn văn",
    part_type: 6,
    skill_group: "core",
    aliases: withPartAlias(6, [
      "Hoàn thành đoạn văn",
      "Text completion",
    ]),
  },

  // Part 7
  {
    key: "part7_information",
    label_vi: "Tìm thông tin",
    part_type: 7,
    skill_group: "core",
    aliases: withPartAlias(7, [
      "Câu hỏi tìm thông tin",
      "Tìm thông tin",
      "Thông tin chi tiết",
      "Information",
      "Detail",
    ]),
  },
  {
    key: "part7_inference",
    label_vi: "Suy luận",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, [
      "Câu hỏi suy luận",
      "Suy luận",
      "Inference",
    ]),
  },
  {
    key: "part7_main_idea_purpose",
    label_vi: "Chủ đề / mục đích",
    part_type: 7,
    skill_group: "core",
    aliases: withPartAlias(7, [
      "Chủ đề",
      "Mục đích",
      "Chủ đề / mục đích",
      "Main idea",
      "Purpose",
    ]),
  },
  {
    key: "part7_vocabulary_context",
    label_vi: "Từ vựng theo ngữ cảnh",
    part_type: 7,
    skill_group: "core",
    aliases: withPartAlias(7, [
      "Từ vựng theo ngữ cảnh",
      "Từ vựng",
      "Vocabulary in context",
      "Context vocabulary",
    ]),
  },
  {
    key: "part7_reference",
    label_vi: "Tham chiếu",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, [
      "Tham chiếu",
      "Đại từ tham chiếu",
      "Reference",
    ]),
  },
  {
    key: "part7_sentence_insertion",
    label_vi: "Điền câu vào đoạn văn",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, [
      "Điền câu vào đoạn văn",
      "Câu hỏi điền câu vào đoạn văn",
      "Sentence insertion",
    ]),
  },
  {
    key: "part7_negative_true_false",
    label_vi: "Câu hỏi NOT / đúng sai",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, [
      "Câu hỏi NOT",
      "Câu hỏi đúng sai",
      "Đúng / sai",
      "NOT question",
      "True/False",
    ]),
  },
  {
    key: "part7_multiple_documents",
    label_vi: "Nhiều đoạn văn / liên văn bản",
    part_type: 7,
    skill_group: "advanced",
    aliases: withPartAlias(7, [
      "Nhiều đoạn văn",
      "Liên văn bản",
      "Multiple documents",
      "Double passage",
      "Triple passage",
    ]),
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

export const normalizeToeicSkillTags = (
  rawTags: string[],
  partType?: number
): NormalizedToeicSkill[] => {
  // Tag chưa nằm trong taxonomy thì bỏ qua, không xem là lỗi.
  return rawTags
    .map((rawTag) => normalizeToeicSkillTag(rawTag, partType))
    .filter((skill): skill is NormalizedToeicSkill => Boolean(skill));
};