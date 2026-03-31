
export type InterviewScope = "personal" | "team" | "dept" | "org";

export type ProviderId = "mock" | "gemini" | "openai" | "claude";

// 役職の階層: 数字が大きいほど上位
export type PositionKey = "member" | "manager" | "director" | "general_manager" | "executive";

export const POSITION_HIERARCHY: Record<PositionKey, { level: number; label: string }> = {
  member:          { level: 1, label: "一般社員" },
  manager:         { level: 2, label: "課長" },
  director:        { level: 3, label: "部長" },
  general_manager: { level: 4, label: "本部長" },
  executive:       { level: 5, label: "取締役" },
};

export const POSITION_OPTIONS = Object.entries(POSITION_HIERARCHY).map(([key, val]) => ({
  value: key,
  label: val.label
}));

export interface UserProfile {
  id: string;
  name: string;
  password?: string;
  secret: string;
  dept?: string;
  team?: string; // 課
  position?: PositionKey; // 役職（課長、部長、本部長、取締役）
  role?: string; // 権限（互換性のため維持）
  isAdmin?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Question {
  id: string;
  text: string;
  axis: "S" | "W" | "O" | "T";
}

export interface Interview {
  interviewId: string;
  createdAt: string;
  tag: string;
  scope: InterviewScope;
  questionAI: ProviderId;
  analysisAI: ProviderId;
  questionCount: number;
  questions: Question[];
}

export interface AnswerResponse {
  questionId: string;
  text: string;
}

export interface Answer {
  answerId: string;
  interviewId: string;
  scope: InterviewScope;   // 回答時のアンケートスコープを保存（後から混同しないように）
  userId: string;
  name: string;
  dept: string;
  team?: string;           // 回答時の所属課（役職フィルタの整合性確保）
  role: string;
  position?: PositionKey;  // 回答時の役職（メタ分析フィルタ用。allUsersが変化しても追跡可能）
  answeredAt: string;
  responses: AnswerResponse[];
}

export interface SWOTItem {
  item: string;      // 抽出されたキーワード（例：「在庫が充実している」）
  score: number;     // 重要度・確信度 (0-100)
  reason: string;    // なぜ選ばれたのか、その理由（簡潔に）
  reconfirm?: string; // 再確認すべき点
  action?: string;    // 具体的なアクションプラン・事例・指導・改善策
  detail?: string;    // 詳細レポート（背景や深層心理の分析）
}

export interface AnalysisResult {
  analysisId: string;   // "interviewId_targetUserId/teamId/deptId/org" の形式
  interviewId: string;
  generatedAt: string;
  scope: InterviewScope;
  title: string;          // 分析時のアンケート名 (Tag)
  targetName: string;     // 分析対象（「組織全体」「〇〇部」「〇〇太郎」等）
  respondentCount: number; // 分析対象となった回答者数
  providerUsed: ProviderId;
  targetUserId?: string;
  targetDept?: string;
  targetTeam?: string;
  positionFilter?: string;
  swot: {
    S: SWOTItem[];
    W: SWOTItem[];
    O: SWOTItem[];
    T: SWOTItem[];
  };
  notes: string[];
}

export interface AIProvider {
  id: ProviderId;
  name: string;
  capabilities: ("generateQuestions" | "analyze")[];
  description: string;
}