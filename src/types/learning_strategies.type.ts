import type {
    LearningPathScenarioSnapshot,
    LearningPathStrategyOptionStatus,
    LearningPathStrategyOptionTrigger,
    LearningPathStrategyType,
} from "../models/learning_path_strategy_option.model";

export type LearningPathStrategyModalMode =
    | "selected_current"
    | "pending_selection"
    | "empty";

export type StrategyAssessmentType = "mini_test" | "full_test";

export type StrategyCyclePreviewStatus =
    | "preview_available"
    | "route_completed"
    | "empty";

export type StrategyCyclePreviewUnit = {
    lesson_manager_id: string;
    title: string;
    part_type: number;
    unit_type?: string;
    target_tags: string[];
    planned_minutes: number;
    estimated_gain?: number;
    reason?: string;
    unit_source?: "strategy" | "alternative";
    source_reason?: string;
};

export type StrategyCyclePreviewGroup = {
    part_type: number;
    part_label: string;
    total_minutes: number;
    unit_count: number;
    units: StrategyCyclePreviewUnit[];
};

export type StrategyCyclePreview = {
    status: StrategyCyclePreviewStatus;
    title: string;
    description: string;
    assessment_type?: StrategyAssessmentType | null;
    assessment_estimated_minutes?: number;
    estimated_learning_minutes: number;
    primary_focus_skill_key?: string | null;
    covered_skill_keys: string[];
    focus_part_type?: number | null;
    cycle_mode?: "main_learning" | "remediation" | "review" | "mixed_practice" | "exam_practice" | null;
    expected_skill_gain?: number | null;
    expected_roi_per_hour?: number | null;
    groups: StrategyCyclePreviewGroup[];
    route_completed_reason?: string;
};

export type StrategyOptionView = {
    option_id: string;

    strategy: LearningPathStrategyType;
    strategy_label: string;
    strategy_description: string;

    scenario: LearningPathScenarioSnapshot;
    scenario_label: string;
    scenario_description: string;

    status: LearningPathStrategyOptionStatus;
    status_label: string;

    title: string;
    description: string;

    focus_part_types: number[];
    focus_skill_keys: string[];
    focus_skill_labels: string[];

    estimated_total_minutes: number;
    estimated_total_hours: number;
    estimated_gain: number;

    summary_reasons: string[];

    preview_cycle?: StrategyCyclePreview | null;

    trigger_type: LearningPathStrategyOptionTrigger;
    source_user_test_id?: string | null;
    source_week_study_id?: string | null;

    created_at?: Date;
    selected_at?: Date;
};

export type StrategyHistoryItem = {
    option_id: string;
    trigger_type: LearningPathStrategyOptionTrigger;
    trigger_label: string;

    strategy: LearningPathStrategyType;
    strategy_label: string;

    scenario: LearningPathScenarioSnapshot;
    scenario_label: string;

    status: LearningPathStrategyOptionStatus;
    status_label: string;

    title: string;
    description: string;

    focus_part_types: number[];
    estimated_gain: number;
    summary_reason: string;

    source_user_test_id?: string | null;
    source_week_study_id?: string | null;

    created_at?: Date;
    selected_at?: Date;
};

export type LearningPathStrategyOverviewResponse = {
    mode: LearningPathStrategyModalMode;

    current_option: StrategyOptionView | null;
    pending_options: StrategyOptionView[];

    history: StrategyHistoryItem[];

    copy: {
        estimated_gain_tooltip: string;
        strategy_note: string;
    };
};

export type SelectLearningPathStrategyOptionResponse = {
    selected_strategy_option: StrategyOptionView;
    dismissed_strategy_options_count: number;
    expired_previous_selected_count: number;
    cycle_status: "cycle_created" | "route_completed";
    generated_week_id?: string | null;
    generated_day_count: number;
};
