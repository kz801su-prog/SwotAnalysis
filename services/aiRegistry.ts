import {
  AIProvider,
  InterviewScope,
  Question,
  AnalysisResult,
  Answer,
  Interview,
  ProviderId,
  SWOTItem,
} from "../types";
import { GoogleGenAI } from "@google/genai";
import { db } from "./storage";

// API Key access — settings (localStorage) takes priority over build-time env var
const getApiKey = (): string => {
  const fromSettings = db.settingsDb.get().geminiApiKey?.trim();
  if (fromSettings) {
    console.log(
      `[AI Registry] API Key loaded from settings (len=${fromSettings.length}, prefix=${fromSettings.substring(0, 8)}...)`,
    );
    return fromSettings;
  }
  const fromEnv = (
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    (process.env as any)?.API_KEY ||
    ""
  ).trim();
  if (fromEnv) {
    console.log(
      `[AI Registry] API Key loaded from env (len=${fromEnv.length}, prefix=${fromEnv.substring(0, 8)}...)`,
    );
  } else {
    console.warn(
      "[AI Registry] WARNING: No API key found. Set it in Admin > Sync settings or in .env",
    );
  }
  return fromEnv;
};

// Model name is read from settings (changeable from admin UI without rebuild)
const getModelName = (): string => {
  const settings = db.settingsDb.get();
  const model = settings.geminiModel || "gemini-2.5-flash";
  console.log(`[AI Registry] Using model: ${model}`);
  return model;
};

// --- Helpers ---
function axisFor(i: number): "S" | "W" | "O" | "T" {
  return (["S", "W", "O", "T"] as const)[i % 4];
}

function finalizeQuestions(raw: any[], count: number, tag: string): Question[] {
  const textSet = new Set<string>();
  const results: Question[] = [];
  for (const item of raw || []) {
    if (results.length >= count) break;
    if (item && item.text && !textSet.has(item.text)) {
      textSet.add(item.text);
      results.push({
        id: `${tag}_q${results.length + 1}`,
        text: item.text,
        axis: item.axis || axisFor(results.length),
      });
    }
  }
  return results;
}

// --- Mock Provider ---
const mockProvider = {
  async generateQuestions(args: {
    scope: InterviewScope;
    tag: string;
    count: number;
  }): Promise<Question[]> {
    const bank = [
      { text: "つい時間を忘れて没頭してしまう業務は？", axis: "S" as const },
      { text: "カレンダーを見て気が重いと感じる予定は？", axis: "W" as const },
      { text: "もし予算が無限にあったら何を始めますか？", axis: "O" as const },
      {
        text: "数年後、今のやり方が時代遅れになると思う部分は？",
        axis: "T" as const,
      },
    ];
    return finalizeQuestions(bank, args.count, args.tag);
  },
  async analyze(args: {
    interview: Interview;
    answers: Answer[];
    title: string;
    targetName: string;
  }): Promise<AnalysisResult> {
    return {
      interviewId: args.interview.interviewId,
      analysisId: `${args.interview.interviewId}_${args.targetName.replace(/\s+/g, "_")}`,
      generatedAt: new Date().toISOString(),
      scope: args.interview.scope,
      title: args.title,
      targetName: args.targetName,
      respondentCount: args.answers.length,
      providerUsed: "mock",
      swot: { S: [], W: [], O: [], T: [] },
      notes: [
        "AI接続エラー。ブラウザコンソール(F12)でエラー内容を確認してください。",
      ],
    };
  },
};

// ============================================================
// 分析プロンプトテンプレート（管理画面から閲覧・編集可能）
// プレースホルダー: {{TITLE}} {{TARGET_NAME}} {{SCOPE_BRIEF}}
//                   {{ANSWER_COUNT}} {{ANSWER_DATA}}
// ============================================================
export const DEFAULT_ANALYSIS_PROMPT = `あなたは「グローバルSWOT戦略研究所」の特別分析チームです。
このチームは以下の世界的権威の専門家で構成されています：

■ 参加専門家チーム
- 競争戦略・SWOT分析の世界的権威（Porter競争優位論・バリューチェーン分析のスペシャリスト）
- メタ分析の第一人者（多数の定性回答から統計的パターンを抽出する質的研究の専門家）
- 組織心理学・行動経済学の専門家（深層動機・認知バイアス除去の専門家）
- 日本の組織文化・人事戦略に精通したシニアコンサルタント

このチームが以下のアンケートデータを精密に解析し、戦略的SWOT分析レポートを作成します。

【分析の原則】
1. S/W/O/Tの各カテゴリにつき、必ず最低5個・最大10個の項目を抽出すること
   （データが少ない場合でも、回答の行間・含意・文脈から洞察を補完し5個以上を確保すること）
2. 表面的な言葉だけでなく、回答の背後にある潜在的意図・感情・繰り返しパターンを読み解くこと
3. メタ分析手法を用いて、複数回答から共通テーマ・統計的傾向・外れ値を識別すること
4. 戦略的重要度の高い順にソートして出力すること
5. 個人名・個人特定情報は絶対に含めないこと（集団の傾向として記述）

【コンテキスト】
1. 分析対象: {{TITLE}} ({{TARGET_NAME}})
2. 分析スコープ: {{SCOPE_BRIEF}}
3. 回答数: {{ANSWER_COUNT}}名

【回答データ（匿名化済み）】
{{ANSWER_DATA}}

【各SWOT項目の記述フォーマット】
- item: 端的な見出し（20文字以内）
- score: 戦略的重要度・確信度 (0-100)
- reason: なぜこの結論に至ったか（メタ分析の根拠・複数回答のパターン・質的エビデンス）
- reconfirm: さらなる確認が必要な仮説・暗黙の前提・潜在リスク
- action: スコープに応じた具体的・実行可能な戦略的アクション
  ※弱み(W)はリスク軽減と改善アクション、強み(S)は活用・展開戦略、
    機会(O)は実現シナリオ、脅威(T)は対策・回避策を必ず記述
- detail: 深層心理・組織力学・競争環境・長期予見を含む詳細考察（200文字以上）

【notes（総括）について】
チーム全員の見解を統合した「核心を突く総括コメント」を3〜5個作成すること。
経営判断・人材育成・組織改革に直接活用できる、示唆に富む内容とすること。

必ず以下のJSON形式のみを出力してください（余計な文章・マークダウンは一切不要）：
{"swot":{"S":[{"item":"...","score":91,"reason":"...","reconfirm":"...","action":"...","detail":"..."}],"W":[],"O":[],"T":[]},"notes":["..."]}`;

// --- Gemini Provider ---
const geminiProvider = {
  async generateQuestions(args: {
    scope: InterviewScope;
    tag: string;
    count: number;
  }): Promise<Question[]> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("APIキーが未設定です。");

    const ai = new GoogleGenAI({ apiKey });
    const modelName = getModelName();

    // Scope specific instructions
    const scopeDescriptions: Record<InterviewScope, string> = {
      personal:
        "【個人レベル】個人の強み・弱み、キャリア、スキル、個人の目標達成を重視。",
      team: "【課レベル】密接なチームワーク、上司（課長）との関係、チーム内での成果の上げ方、課独自のルールを重視。",
      dept: "【部レベル】部署間の連携、外部競争環境、部門戦略、予算配分、中長期的な部門目標を重視。",
      org: "【会社レベル】企業文化、ブランド、市場での立ち位置、経営戦略、全社的な脅威と機会を重視。",
    };

    const prompt = `あなたは組織開発と戦略的SWOT分析を専門とするプロの組織心理学者です。
分析のコンテキスト: ${args.tag}
分析スコープ: ${scopeDescriptions[args.scope] || args.scope}

このスコープ（${args.scope}）に特化した、深層心理と本音を引き出すためのSWOT質問を${args.count}個、日本語で作成してください。

【制約事項】
1. 他のスコープ（個人、課、部、会社）と混同されないよう、対象となる「単位（自分/チーム/部門/会社全体）」を明確にした質問にすること。
2. 日本語として自然で、回答者が具体的に答えやすい質問にすること。
3. SWOT（強み、弱み、機会、脅威）の視点を均等に盛り込むこと。
4. 必ず以下のJSON配列（オブジェクトのみ含む）のみを出力してください。余計な説明文は一切不要です。
[{"text": "具体的な質問文", "axis": "S"|"W"|"O"|"T"}]`;

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      const text = response.text?.replace(/```json|```/g, "").trim() || "[]";
      const raw = JSON.parse(text);
      const result = finalizeQuestions(raw, args.count, args.tag);
      console.log(
        `[Gemini] Generated ${result.length} questions for scope [${args.scope}] using ${modelName}`,
      );
      return result;
    } catch (e: any) {
      console.error(`[Gemini] ${modelName} failed:`, e.message);
      throw new Error(`質問生成エラー (${modelName}): ${e.message}`);
    }
  },

  async analyze(args: {
    interview: Interview;
    answers: Answer[];
    title: string;
    targetName: string;
    customPromptTemplate?: string;
  }): Promise<AnalysisResult> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("APIキーが未設定です。");

    const ai = new GoogleGenAI({ apiKey });
    const modelName = getModelName();

    const answersJson = JSON.stringify(
      args.answers.map((a, idx) => ({ respondent: `回答者${idx + 1}`, responses: a.responses }))
    );

    const template = args.customPromptTemplate || DEFAULT_ANALYSIS_PROMPT;
    const scopeBriefs: Record<InterviewScope, string> = {
      personal: "【個人レベル】セルフアウェアネス・スキル・キャリア形成に焦点を当て、個人の成長戦略を提示するアドバイス。",
      team:     "【課レベル】チームワークの改善、上司・部下との連携、課独自の業務成果最大化と心理的安全性向上に焦点を当てたアドバイス。",
      dept:     "【部レベル】部門間シナジー・リソース配分の最適化・中長期目標の必達・組織文化の醸成に焦点を当てたアドバイス。",
      org:      "【会社レベル】市場優位性・ブランド力・経営戦略・全社的リスク対策・長期企業存続に焦点を当てた経営判断レベルのアドバイス。",
    };
    const prompt = template
      .replace("{{TITLE}}", args.title)
      .replace("{{TARGET_NAME}}", args.targetName)
      .replace("{{SCOPE_BRIEF}}", scopeBriefs[args.interview.scope] || args.interview.scope)
      .replace("{{ANSWER_COUNT}}", String(args.answers.length))
      .replace("{{ANSWER_DATA}}", answersJson);

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      // Attempt to extract text safely
      const body = response.text?.replace(/```json|```/g, "").trim() || "{}";
      let data;
      try {
        data = JSON.parse(body);
      } catch (err) {
        console.error("[Gemini] Parse Failure. Body:", body);
        throw new Error("AIの応答をJSONとして解析できませんでした。");
      }

      // Defensive initialization of SWOT object
      const swot = data.swot || {};
      const safeSwot = {
        S: Array.isArray(swot.S) ? swot.S : [],
        W: Array.isArray(swot.W) ? swot.W : [],
        O: Array.isArray(swot.O) ? swot.O : [],
        T: Array.isArray(swot.T) ? swot.T : [],
      };

      console.log(
        `[Gemini] Analysis complete using ${modelName}:`,
        Object.keys(safeSwot).map((k) => `${k}:${safeSwot[k].length}`),
      );

      return {
        interviewId: args.interview.interviewId,
        analysisId: `${args.interview.interviewId}_${args.targetName.replace(/\s+/g, "_")}`,
        generatedAt: new Date().toISOString(),
        scope: args.interview.scope,
        title: args.title,
        targetName: args.targetName,
        respondentCount: args.answers.length,
        providerUsed: "gemini",
        swot: safeSwot,
        notes: Array.isArray(data.notes) ? data.notes : [],
      };
    } catch (e: any) {
      console.error(`[Gemini] ${modelName} failed:`, e.message);
      throw new Error(`分析エラー (${modelName}): ${e.message}`);
    }
  },
};

// --- Registry ---
export const providers: AIProvider[] = [
  {
    id: "mock",
    name: "Mock AI (Local)",
    capabilities: ["generateQuestions", "analyze"],
    description: "開発用",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    capabilities: ["generateQuestions", "analyze"],
    description: "設定画面でモデル名を変更可能",
  },
];

export const aiRegistry = {
  generateQuestions: async (
    pId: ProviderId,
    scope: InterviewScope,
    tag: string,
    count: number,
  ) => {
    if (pId === "gemini") {
      try {
        return await geminiProvider.generateQuestions({ scope, tag, count });
      } catch (e: any) {
        alert("Gemini質問生成失敗:\n" + e.message);
        return mockProvider.generateQuestions({ scope, tag, count });
      }
    }
    return mockProvider.generateQuestions({ scope, tag, count });
  },
  analyze: async (
    pId: ProviderId,
    interview: Interview,
    answers: Answer[],
    title: string,
    targetName: string,
    customPromptTemplate?: string,
  ) => {
    const apiKey = getApiKey();
    // Always use Gemini when key is available (auto-upgrades interviews stored with analysisAI="mock")
    if (apiKey) {
      try {
        return await geminiProvider.analyze({
          interview,
          answers,
          title,
          targetName,
          customPromptTemplate,
        });
      } catch (e: any) {
        console.error("[Registry] Gemini Full Failure:", e);
        throw new Error(
          "Gemini分析失敗:\n" +
            e.message +
            "\n\n※設定（モデル名やAPIキーなど）を確認してください。",
        );
      }
    }
    // No API key found — throw so user sees a clear error instead of silent mock result
    if (pId !== "mock") {
      throw new Error(
        "Gemini APIキーが設定されていません。\n管理画面の設定タブで「Gemini APIキー」を入力して保存してください。",
      );
    }
    return mockProvider.analyze({ interview, answers, title, targetName });
  },
};
