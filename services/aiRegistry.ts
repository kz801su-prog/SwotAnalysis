import { AIProvider, InterviewScope, Question, AnalysisResult, Answer, Interview, ProviderId, SWOTItem } from "../types";
import { GoogleGenAI } from "@google/genai";
import { db } from "./storage";

// API Key access — settings (localStorage) takes priority over build-time env var
const getApiKey = (): string => {
    const fromSettings = db.settingsDb.get().geminiApiKey?.trim();
    if (fromSettings) {
        console.log(`[AI Registry] API Key loaded from settings (len=${fromSettings.length}, prefix=${fromSettings.substring(0, 8)}...)`);
        return fromSettings;
    }
    const fromEnv = ((import.meta as any).env?.VITE_GEMINI_API_KEY || (process.env as any)?.API_KEY || "").trim();
    if (fromEnv) {
        console.log(`[AI Registry] API Key loaded from env (len=${fromEnv.length}, prefix=${fromEnv.substring(0, 8)}...)`);
    } else {
        console.warn("[AI Registry] WARNING: No API key found. Set it in Admin > Sync settings or in .env");
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
        axis: item.axis || axisFor(results.length)
      });
    }
  }
  return results;
}

// --- Mock Provider ---
const mockProvider = {
  async generateQuestions(args: { scope: InterviewScope; tag: string; count: number }): Promise<Question[]> {
    const bank = [
      { text: "つい時間を忘れて没頭してしまう業務は？", axis: "S" as const },
      { text: "カレンダーを見て気が重いと感じる予定は？", axis: "W" as const },
      { text: "もし予算が無限にあったら何を始めますか？", axis: "O" as const },
      { text: "数年後、今のやり方が時代遅れになると思う部分は？", axis: "T" as const }
    ];
    return finalizeQuestions(bank, args.count, args.tag);
  },
  async analyze(args: { interview: Interview; answers: Answer[]; title: string; targetName: string }): Promise<AnalysisResult> {
    return {
      interviewId: args.interview.interviewId,
      generatedAt: new Date().toISOString(),
      scope: args.interview.scope,
      title: args.title,
      targetName: args.targetName,
      respondentCount: args.answers.length,
      providerUsed: 'mock',
      swot: { S: [], W: [], O: [], T: [] },
      notes: ["AI接続エラー。ブラウザコンソール(F12)でエラー内容を確認してください。"]
    };
  }
};

// --- Gemini Provider ---
const geminiProvider = {
  async generateQuestions(args: { scope: InterviewScope; tag: string; count: number }): Promise<Question[]> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("APIキーが未設定です。");
    
    const ai = new GoogleGenAI({ apiKey });
    const modelName = getModelName();
    
    // Scope specific instructions
    const scopeDescriptions: Record<InterviewScope, string> = {
      personal: "【個人レベル】個人の強み・弱み、キャリア、スキル、個人の目標達成を重視。",
      team: "【課レベル】密接なチームワーク、上司（課長）との関係、チーム内での成果の上げ方、課独自のルールを重視。",
      dept: "【部レベル】部署間の連携、外部競争環境、部門戦略、予算配分、中長期的な部門目標を重視。",
      org: "【会社レベル】企業文化、ブランド、市場での立ち位置、経営戦略、全社的な脅威と機会を重視。"
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
      console.log(`[Gemini] Generated ${result.length} questions for scope [${args.scope}] using ${modelName}`);
      return result;
    } catch (e: any) {
      console.error(`[Gemini] ${modelName} failed:`, e.message);
      throw new Error(`質問生成エラー (${modelName}): ${e.message}`);
    }
  },

  async analyze(args: { interview: Interview; answers: Answer[]; title: string; targetName: string }): Promise<AnalysisResult> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("APIキーが未設定です。");
    
    const ai = new GoogleGenAI({ apiKey });
    const modelName = getModelName();
    
    // Scope specific instructions
    const scopeBriefs: Record<InterviewScope, string> = {
      personal: "【個人レベル】セルフアウェアネス、スキルアップ、キャリア形成に焦点を当てたアドバイス。",
      team: "【課レベル】チームワークの改善、上司・部下との連携、具体的な業務成果の最大化に焦点を当てたアドバイス。",
      dept: "【部レベル】部門間シナジー、リソース配分の最適化、部門目標の必達、組織文化の醸成に焦点を当てたアドバイス。",
      org: "【会社レベル】経営判断に役立つ市場優位性の定義、ブランド力強化、長期的な企業存続のためのリスク対策に焦点を当てたアドバイス。"
    };

    const prompt = `あなたは組織戦略のプロフェッショナル分析官です。
以下の分析スコープと回答データを元に、非常に高い品質の戦略的SWOT分析レポート（JSON形式）を作成してください。

【コンテキスト】
1. 分析対象: ${args.title} (${args.targetName})
2. 分析スコープ: ${scopeBriefs[args.interview.scope] || args.interview.scope}
3. 回答数: ${args.answers.length}名

【回答データ】
${JSON.stringify(args.answers.map(a => ({ user: a.name, responses: a.responses })))}

【レポート作成ルール】
1. S/W/O/Tの各項目につき、データから洞察される本質的なポイントを抽出すること。
2. item: 端的な見出し（20文字以内）。
3. score: データの確実性や重要度に基づき重み付け。
4. reason: なぜその結論に至ったか、回答の根拠を提示。
5. reconfirm: 暗黙の了解や、更なる事実確認が必要な曖昧な点。
6. action: 対象スコープに応じた具体的で実行可能な「戦略的行動」。弱みに対しては、現実的かつ厳しい忠告を含めること。
7. detail: 背景心理や戦略的価値、長期予見。数百文字程度のプロ品質の深い考察を記述。
8. notes: レポート全体の総括的な「核心を突く」一言アドバイス。

必ず以下のJSON形式（オブジェクトのみ含む）のみを出力してください。
{"swot":{"S":[{"item":"...","score":91,"reason":"...","reconfirm":"...","action":"...","detail":"..."}],"W":[],"O":[],"T":[]},"notes":["..."]}`;

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
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
        T: Array.isArray(swot.T) ? swot.T : []
      };

      console.log(`[Gemini] Analysis complete using ${modelName}:`, Object.keys(safeSwot).map(k => `${k}:${safeSwot[k].length}`));
      
      return {
        interviewId: args.interview.interviewId,
        generatedAt: new Date().toISOString(),
        scope: args.interview.scope,
        title: args.title,
        targetName: args.targetName,
        respondentCount: args.answers.length,
        providerUsed: 'gemini',
        swot: safeSwot,
        notes: Array.isArray(data.notes) ? data.notes : []
      };
    } catch (e: any) {
      console.error(`[Gemini] ${modelName} failed:`, e.message);
      throw new Error(`分析エラー (${modelName}): ${e.message}`);
    }
  }
};

// --- Registry ---
export const providers: AIProvider[] = [
  { id: "mock", name: "Mock AI (Local)", capabilities: ["generateQuestions", "analyze"], description: "開発用" },
  { id: "gemini", name: "Google Gemini", capabilities: ["generateQuestions", "analyze"], description: "設定画面でモデル名を変更可能" }
];

export const aiRegistry = {
  generateQuestions: async (pId: ProviderId, scope: InterviewScope, tag: string, count: number) => {
    if (pId === "gemini") {
      try { return await geminiProvider.generateQuestions({ scope, tag, count }); }
      catch (e: any) {
        alert("Gemini質問生成失敗:\n" + e.message);
        return mockProvider.generateQuestions({ scope, tag, count });
      }
    }
    return mockProvider.generateQuestions({ scope, tag, count });
  },
  analyze: async (pId: ProviderId, interview: Interview, answers: Answer[], title: string, targetName: string) => {
    // Auto-upgrade mock→gemini when API key is available (covers interviews created before gemini was set as default)
    const effectiveId = (pId === "mock" && getApiKey()) ? "gemini" : pId;
    if (effectiveId === "gemini") {
      try { return await geminiProvider.analyze({ interview, answers, title, targetName }); }
      catch (e: any) {
        console.error("[Registry] Gemini Full Failure:", e);
        throw new Error("Gemini分析失敗:\n" + e.message + "\n\n※設定（モデル名やAPIキーなど）を確認してください。");
      }
    }
    return mockProvider.analyze({ interview, answers, title, targetName });
  }
};