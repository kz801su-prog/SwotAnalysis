import { Interview, Answer, AnalysisResult, UserProfile } from "../types";

export interface AllowedUser {
  id: string; // Last 3 digits
  name: string;
  fullId: string;
}

const STORAGE_KEYS = {
  INTERVIEWS: "swot_interviews",
  ANSWERS: "swot_answers",
  ANALYSES: "swot_analyses",
  USERS: "swot_users",
  ALLOWED_USERS: "swot_allowed_users",
  SETTINGS: "swot_settings"
};

export interface SystemSettings {
  gasUrl: string;
  autoSync: boolean;
  geminiModel: string; // e.g. "gemini-2.5-flash"
  geminiApiKey: string;
  cliqWebhookUrl: string; // Zoho Cliq Incoming Webhook URL
}

export const db = {
  getInterviews: (): Interview[] => {
    const data = localStorage.getItem(STORAGE_KEYS.INTERVIEWS);
    return data ? JSON.parse(data) : [];
  },
  
  saveInterview: (interview: Interview) => {
    const current = db.getInterviews();
    localStorage.setItem(STORAGE_KEYS.INTERVIEWS, JSON.stringify([interview, ...current]));
    // Auto-sync
    db._autoSync();
  },

  deleteInterview: (id: string) => {
    const interviews = db.getInterviews().filter(i => i.interviewId !== id);
    localStorage.setItem(STORAGE_KEYS.INTERVIEWS, JSON.stringify(interviews));

    const answers = db.getAnswers().filter(a => a.interviewId !== id);
    localStorage.setItem(STORAGE_KEYS.ANSWERS, JSON.stringify(answers));

    const analyses = db.getAnalyses().filter(a => a.interviewId !== id);
    localStorage.setItem(STORAGE_KEYS.ANALYSES, JSON.stringify(analyses));
    db._autoSync();
  },

  getAnswers: (interviewId?: string): Answer[] => {
    const data = localStorage.getItem(STORAGE_KEYS.ANSWERS);
    const allAnswers: Answer[] = data ? JSON.parse(data) : [];
    if (interviewId) {
      return allAnswers.filter((a) => String(a.interviewId) === String(interviewId));
    }
    return allAnswers;
  },

  saveAnswer: (answer: Answer) => {
    const current = db.getAnswers();
    const filtered = current.filter(a => !(a.userId === answer.userId && a.interviewId === answer.interviewId));
    localStorage.setItem(STORAGE_KEYS.ANSWERS, JSON.stringify([...filtered, answer]));
    db._autoSync();
  },

  getAnalyses: (interviewId?: string): AnalysisResult[] => {
    const data = localStorage.getItem(STORAGE_KEYS.ANALYSES);
    const all: AnalysisResult[] = data ? JSON.parse(data) : [];
    if (interviewId) {
      return all.filter((a) => a.interviewId === interviewId);
    }
    return all;
  },

  saveAnalysis: (analysis: AnalysisResult) => {
    // analysisId が未設定の場合は interviewId + 対象を組み合わせて生成
    if (!analysis.analysisId) {
      const target = analysis.targetUserId || analysis.targetTeam || analysis.targetDept || 'org';
      analysis = { ...analysis, analysisId: `${analysis.interviewId}_${target}` };
    }
    const current = db.getAnalyses();
    const filtered = current.filter(a => a.analysisId !== analysis.analysisId);
    localStorage.setItem(STORAGE_KEYS.ANALYSES, JSON.stringify([analysis, ...filtered]));
    db._autoSync();
  },

  getUser: (id: string): UserProfile | null => {
    const data = localStorage.getItem(STORAGE_KEYS.USERS);
    const users: UserProfile[] = data ? JSON.parse(data) : [];
    return users.find(u => u.id === id) || null;
  },

  getAllUsers: (): UserProfile[] => {
    const data = localStorage.getItem(STORAGE_KEYS.USERS);
    return data ? JSON.parse(data) : [];
  },

  saveUser: (user: UserProfile) => {
    const data = localStorage.getItem(STORAGE_KEYS.USERS);
    const users: UserProfile[] = data ? JSON.parse(data) : [];
    const updatedUser = { ...user, updatedAt: new Date().toISOString() };
    const filtered = users.filter(u => u.id !== user.id);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify([...filtered, updatedUser]));
    db._autoSync();
  },
  
  deleteUser: (id: string) => {
    const data = localStorage.getItem(STORAGE_KEYS.USERS);
    const users: UserProfile[] = data ? JSON.parse(data) : [];
    const filtered = users.filter(u => u.id !== id);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(filtered));
  },

  getAllowedUsers: (): AllowedUser[] => {
    const data = localStorage.getItem(STORAGE_KEYS.ALLOWED_USERS);
    return data ? JSON.parse(data) : [];
  },

  saveAllowedUsers: (users: AllowedUser[]) => {
    localStorage.setItem(STORAGE_KEYS.ALLOWED_USERS, JSON.stringify(users));
    db._autoSync();
  },

  _getTime: (obj: any): number => {
    if (!obj) return 0;
    // updatedAt を createdAt より優先する（更新日時の方が実態を正確に反映するため）
    const time = obj.answeredAt || obj.generatedAt || obj.updatedAt || obj.createdAt || 0;
    return time ? new Date(time).getTime() : 0;
  },

  exportDatabase: () => {
    return {
      interviews: JSON.parse(localStorage.getItem(STORAGE_KEYS.INTERVIEWS) || '[]'),
      answers: JSON.parse(localStorage.getItem(STORAGE_KEYS.ANSWERS) || '[]'),
      analyses: JSON.parse(localStorage.getItem(STORAGE_KEYS.ANALYSES) || '[]'),
      users: JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]'),
      allowedUsers: JSON.parse(localStorage.getItem(STORAGE_KEYS.ALLOWED_USERS) || '[]'),
      timestamp: new Date().toISOString()
    };
  },

  _mergeCollections: <T>(local: T[], cloud: T[], idKey: keyof T): T[] => {
    const merged = [...local];
    cloud.forEach(cloudItem => {
      const idx = merged.findIndex(m => m[idKey] === cloudItem[idKey]);
      if (idx === -1) {
        merged.push(cloudItem);
      } else {
        // 時刻比較を行い、新しい方を採用する
        const localTime = db._getTime(merged[idx]);
        const cloudTime = db._getTime(cloudItem);
        if (cloudTime > localTime) {
          merged[idx] = cloudItem;
        }
      }
    });
    return merged;
  },

  importDatabase: (data: any) => {
    if (!data) return;
    if (data.interviews) {
      const merged = db._mergeCollections(db.getInterviews(), data.interviews, "interviewId" as any);
      localStorage.setItem(STORAGE_KEYS.INTERVIEWS, JSON.stringify(merged));
    }
    if (data.answers) {
      const merged = db._mergeCollections(db.getAnswers(), data.answers, "answerId" as any);
      localStorage.setItem(STORAGE_KEYS.ANSWERS, JSON.stringify(merged));
    }
    if (data.analyses) {
      const merged = db._mergeCollections(db.getAnalyses(), data.analyses, "analysisId" as any);
      localStorage.setItem(STORAGE_KEYS.ANALYSES, JSON.stringify(merged));
    }
    if (data.users) {
      const merged = db._mergeCollections(db.getAllUsers(), data.users, "id" as any);
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(merged));
    }
    if (data.allowedUsers) {
      const merged = db._mergeCollections(db.getAllowedUsers(), data.allowedUsers, "id" as any);
      localStorage.setItem(STORAGE_KEYS.ALLOWED_USERS, JSON.stringify(merged));
    }
  },

  settingsDb: {
    get: (): SystemSettings => {
      const defaults: SystemSettings = {
        gasUrl: "https://kz801xs.xsrv.jp/vitsw/api.php",
        autoSync: true,
        geminiModel: "gemini-2.5-flash",
        geminiApiKey: "",
        cliqWebhookUrl: ""
      };
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) return defaults;
      try {
        const parsed = JSON.parse(data);
        const merged = { ...defaults, ...parsed, gasUrl: parsed.gasUrl || defaults.gasUrl };
        // Upgrade stale model name that was incorrectly saved as gemini-1.5-flash
        if (merged.geminiModel === "gemini-1.5-flash") merged.geminiModel = "gemini-2.5-flash";
        return merged;
      } catch (e) {
        return defaults;
      }
    },
    save: (settings: SystemSettings) => {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    },
    sync: async (): Promise<{success: boolean, message: string}> => {
      const { gasUrl } = db.settingsDb.get();
      const trimmedUrl = gasUrl?.trim();
      if (!trimmedUrl) return { success: false, message: "MySQL API URLが設定されていません。" };
      try {
        await db.settingsDb.pull();
        const localData = db.exportDatabase();
        const pushResponse = await fetch(trimmedUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localData)
        });
        if (!pushResponse.ok) throw new Error(`Push failed: ${pushResponse.status}`);
        return { success: true, message: "データを統合してMySQLへ保存しました。" };
      } catch (e: any) {
        return { success: false, message: `同期失敗: ${e.message}` };
      }
    },
    pull: async (): Promise<{success: boolean, message: string}> => {
      const { gasUrl } = db.settingsDb.get();
      const trimmedUrl = gasUrl?.trim();
      if (!trimmedUrl) return { success: false, message: "MySQL API URLが設定されていません。" };
      try {
        // GETリクエストがブラウザにキャッシュされて「読みに行かない」状態になるのを防ぐため、現在時刻パラメーターを付与
        const cacheBuster = trimmedUrl.includes('?') ? `&t=${Date.now()}` : `?t=${Date.now()}`;
        const response = await fetch(trimmedUrl + cacheBuster, { 
          method: 'GET', 
          cache: 'no-store' 
        });
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
           throw new Error("APIがJSONを返しませんでした。");
        }
        const cloudData = await response.json();
        if (cloudData && cloudData.success === false) {
           return { success: false, message: `SQLサーバーエラー: ${cloudData.message}` };
        }
        if (cloudData && typeof cloudData === 'object' && Object.keys(cloudData).length > 0) {
          db.importDatabase(cloudData);
          return { success: true, message: "データを統合しました。" };
        }
        return { success: false, message: "データが空です。" };
      } catch (e: any) {
        return { success: false, message: `取得失敗: ${e.message}` };
      }
    }
  },

  _autoSync: () => {
    const { gasUrl, autoSync } = db.settingsDb.get();
    if (!gasUrl || !autoSync) return;
    // pull→マージ→pushの順で行い、他ユーザーのデータを上書きしないようにする
    db.settingsDb.sync().catch(() => {});
  }
};

// Seed initial admin if not existing
if (typeof window !== 'undefined') {
  const admin = db.getUser("692");
  if (!admin) {
    const data = localStorage.getItem(STORAGE_KEYS.USERS);
    const users: UserProfile[] = data ? JSON.parse(data) : [];
    const newAdmin: UserProfile = {
      id: "692",
      name: "Wisteria Admin",
      dept: "管理本部",
      team: "システム課",
      role: "ADMIN",
      isAdmin: true,
      password: "password",
      secret: "DISABLED_FOR_DEV",
      // 過去日時を設定することで、サーバーの最新データが必ずマージ時に勝つようにする
      createdAt: "2020-01-01T00:00:00.000Z"
    };
    // db.saveUser() を叩くと勝手に _autoSync() が走って空のDBで上書きしてしまうため、localStorageへ直接書き込む
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify([...users, newAdmin]));
  }
}
