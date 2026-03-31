import React, { useEffect, useState } from "react";
import { Card, Button, Select, Input, Badge, Modal } from "../components/UI";
import { db, AllowedUser } from "../services/storage";
import { aiRegistry, providers } from "../services/aiRegistry";
import { Interview, AnalysisResult, SWOTItem, InterviewScope, ProviderId, UserProfile, POSITION_OPTIONS, POSITION_HIERARCHY, PositionKey } from "../types";
import { Zap, PieChart, Plus, Eye, Database, Upload, Download, Settings, Users, User, Trash2, Edit2, ShieldAlert, Target, Briefcase, FileText, BarChart3, Cloud, RefreshCw, UserPlus } from "lucide-react";

const ALL_POSITION_KEYS: PositionKey[] = ['member', 'manager', 'director', 'general_manager', 'executive'];

// 代理・代行・補佐・心得などを正位に格上げしてレベルを返す
function getPositionLevel(position?: string, roleString?: string): number {
  const levels: Record<string, number> = { member: 1, manager: 2, director: 3, general_manager: 4, executive: 5 };
  // PositionKey が明示的に設定されていれば優先
  if (position && position !== 'member' && levels[position] !== undefined) return levels[position];
  // 役職文字列から推定（代理/代行/補佐/心得 → 正位に格上げ）
  const normalized = (roleString || '').replace(/代理$|補佐$|代行$|心得$/, '').trim();
  if (/取締役/.test(normalized)) return 5;
  if (/本部長/.test(normalized)) return 4;
  if (/部長/.test(normalized)) return 3;
  if (/課長/.test(normalized)) return 2;
  return levels[position || 'member'] || 1;
}

function levelToKey(level: number): PositionKey {
  const map: Record<number, PositionKey> = { 1: 'member', 2: 'manager', 3: 'director', 4: 'general_manager', 5: 'executive' };
  return map[level] || 'member';
}

const SCOPE_OPTIONS = [
  { value: "personal", label: "個人 (Personal)" },
  { value: "team", label: "課 (Team)" },
  { value: "dept", label: "部 (Department)" },
  { value: "org", label: "会社 (Organization)" },
];

const DEPARTMENTS = [
  "管理本部",
  "営業本部",
  "イズライフ事業部",
  "プローン事業部",
  "ブランチ事業部",
  "JIP",
  "IDC企画部",
  "IDC東京",
  "TLC"
];

function SWOTSection({ title, items, colorClass }: { title: string; items: SWOTItem[]; colorClass: string }) {
  const isWeakness = title.includes("WEAKNESS");
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shadow-sm h-full flex flex-col">
      <div className={`px-4 py-3 border-b border-slate-200 text-xs font-bold tracking-wider ${colorClass} bg-slate-100/50`}>
        {title}
      </div>
      <div className="p-4 space-y-5 flex-1 overflow-y-auto max-h-[500px]">
        {(items || []).map((item, i) => (
          <div key={i} className="space-y-2 border-b border-slate-200/50 pb-4 last:border-0 last:pb-0">
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2">
                <div className="text-[10px] font-bold bg-slate-200 text-slate-600 w-5 h-5 flex items-center justify-center rounded-full">#{i+1}</div>
                <div className="text-sm font-bold text-slate-800">{item.item}</div>
              </div>
              <div className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 shadow-sm" title="重要度/確信度">{item.score.toFixed(0)}</div>
            </div>
            <div className="text-[10px] text-slate-500 mt-1 italic leading-tight px-1 mb-2">{item.reason}</div>
            {item.reconfirm && (
              <div className="text-[11px] leading-relaxed text-slate-600 bg-white/60 p-2 rounded-lg border border-slate-100 mb-1">
                <span className="font-bold text-slate-400 mr-2 text-[9px] uppercase tracking-tighter">Fact Check (再確認)</span>
                {item.reconfirm}
              </div>
            )}
            {item.action && (
              <div className={`text-[11px] leading-relaxed p-2 rounded-lg border shadow-sm ${isWeakness ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                <span className="font-bold mr-2 text-[9px] uppercase tracking-tighter">
                  {isWeakness ? 'RISK MITIGATION & ACTIONS' : 'STRATEGIC ACTION / EXAMPLE'}
                </span>
                {item.action}
              </div>
            )}
            {item.detail && (
              <div className="mt-2 p-2 bg-slate-100/50 rounded-lg text-[10px] text-slate-600 border border-dotted border-slate-300">
                <div className="font-bold text-slate-400 mb-1 tracking-widest text-[8px] uppercase">Detailed Strategy Report</div>
                <div className="whitespace-pre-wrap">{item.detail}</div>
              </div>
            )}
          </div>
        ))}
        {(!items || items.length === 0) && <div className="text-xs text-slate-400 italic text-center py-4">分析データなし</div>}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'create' | 'analyze' | 'answers' | 'data' | 'users' | 'sync'>('create');
  
  // Create State
  const [tag, setTag] = useState(`戦略立案データ分析＿${new Date().toISOString().slice(0, 10)}`);
  const [scope, setScope] = useState<InterviewScope>("personal");
  const [questionAI, setQuestionAI] = useState<ProviderId>("gemini");
  const [analysisAI, setAnalysisAI] = useState<ProviderId>("gemini");
  const [questionCount, setQuestionCount] = useState(20);
  const [isCreating, setIsCreating] = useState(false);

  // Data State
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [selectedId, setSelectedId] = useState("");
  
  // Answers Tab State
  const [answerSortKey, setAnswerSortKey] = useState<'userId' | 'team' | 'dept' | 'answeredAt' | 'surveyCreatedAt'>('answeredAt');
  const [answerSortDir, setAnswerSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedAnswerId, setExpandedAnswerId] = useState<string | null>(null);

  // Analysis State
  const [existingAnalyses, setExistingAnalyses] = useState<AnalysisResult[]>([]);
  const [selectedAnalysisResult, setSelectedAnalysisResult] = useState<AnalysisResult | null>(null);
  
  // Analysis Filter State
  const [filterMode, setFilterMode] = useState<"ALL" | "USER" | "DEPT" | "TEAM">("ALL");
  const [targetValue, setTargetValue] = useState<string>("");
  const [selectedPositions, setSelectedPositions] = useState<Set<PositionKey>>(new Set(ALL_POSITION_KEYS));

  // Result View State
  const [viewMode, setViewMode] = useState<"detail" | "summary">("detail");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [preview, setPreview] = useState<Interview | null>(null);

  // User Management State
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  const [allowedUsers, setAllowedUsers] = useState<AllowedUser[]>([]);
  const [editingAllowedUser, setEditingAllowedUser] = useState<AllowedUser | null>(null);
  const [allowedUserModalOpen, setAllowedUserModalOpen] = useState(false);

  // Sync State
  const [settings, setSettings] = useState(db.settingsDb.get());
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const init = async () => {
      // まずSQLから最新データを取得してからUIを更新する
      await db.settingsDb.pull();
      refreshData();
    };
    init();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.trim().split('\n');
      const users: AllowedUser[] = [];
      
      lines.forEach((line) => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length >= 2) {
          const fullId = cols[0];
          const name = cols[1];
          // If valid 4-5 digit or at least numeric id
          if (/\d+/.test(fullId) && fullId.length >= 3) {
             const shortId = fullId.slice(-3); // Last 3 digits
             users.push({ id: shortId, name: name, fullId: fullId });
          }
        }
      });

      if (users.length > 0) {
        db.saveAllowedUsers(users);
        alert(`CSVから ${users.length} 名の事前登録データを読み込みました。`);
        refreshData();
      } else {
        alert("有効なユーザーデータが見つかりませんでした。");
      }
    };
    reader.readAsText(file);
    
    // Clear the input
    if (e.target) e.target.value = '';
  };

  const refreshData = () => {
    const list = db.getInterviews();
    setInterviews(list);
    if (list.length > 0 && !selectedId) setSelectedId(list[0].interviewId);
    setAllUsers(db.getAllUsers());
    setAllowedUsers(db.getAllowedUsers());
    
    // Refresh detailed lists for Data Tab
    setExistingAnalyses(db.getAnalyses());
  };

  // Load answers and existing analyses when interview changes for Analysis Tab
  useEffect(() => {
    if (selectedId && activeTab === 'analyze') {
      // アンケートのスコープに応じてフィルターモードを自動設定
      const interview = interviews.find((i: Interview) => i.interviewId === selectedId);
      if (interview) {
        if (interview.scope === 'org')      { setFilterMode('ALL');  setTargetValue(''); }
        else if (interview.scope === 'dept') { setFilterMode('DEPT'); }
        else if (interview.scope === 'team') { setFilterMode('TEAM'); }
        else                                 { setFilterMode('USER'); } // personal
      }

      // SQLから最新の回答・ユーザー情報を取得し、対象の初期値を確定する
      db.settingsDb.pull().then(() => {
        const freshUsers = db.getAllUsers();
        setAllUsers(freshUsers);
        setExistingAnalyses(db.getAnalyses(selectedId));

        // ユーザー一覧確定後に targetValue の初期値を設定
        if (interview?.scope === 'dept') {
          const depts = Array.from(new Set(freshUsers.filter(u => u.dept).map(u => u.dept!)));
          setTargetValue((v: string) => v || depts[0] || '');
        } else if (interview?.scope === 'team') {
          const teams = Array.from(new Set(freshUsers.filter((u: UserProfile) => u.team).map((u: UserProfile) => u.team!)));
          setTargetValue((v: string) => v || teams[0] || '');
        } else if (interview?.scope === 'personal') {
          setTargetValue((v: string) => v || freshUsers[0]?.id || '');
        }
      });
      setSelectedAnalysisResult(null);
    }
  }, [selectedId, activeTab]);

  // Pull latest answers from SQL when Answers tab is opened
  useEffect(() => {
    if (activeTab === 'answers') {
      db.settingsDb.pull().then(() => {
        setAllUsers(db.getAllUsers());
        setInterviews(db.getInterviews());
      });
    }
  }, [activeTab]);

  const handleCreate = async () => {
    if (!tag.trim()) return;
    setIsCreating(true);
    try {
      const questions = await aiRegistry.generateQuestions(questionAI, scope, tag, questionCount);
      const newInterview: Interview = {
        interviewId: `iv_${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        tag,
        scope,
        questionAI,
        analysisAI,
        questionCount,
        questions
      };
      
      db.saveInterview(newInterview);
      refreshData();
      setPreview(newInterview);
      alert("システムが正常に生成されました。");
    } catch (error) {
      console.error(error);
      alert("生成に失敗しました。");
    } finally {
      setIsCreating(false);
    }
  };

  const handleAnalyze = async () => {
    const selectedInterview = interviews.find(i => i.interviewId === selectedId);
    if (!selectedInterview) return;
    console.log("[handleAnalyze] interview.analysisAI =", selectedInterview.analysisAI, "| settings =", db.settingsDb.get());
    
    // SQLから直接最新データを取得（stateが古い場合に備えて）
    await db.settingsDb.pull();
    const freshAnswers = db.getAnswers(selectedId);
    if (freshAnswers.length === 0) {
        alert("選択されたシステム（アンケート）に対する回答データがありません。\n※ 他のシステムを選択するか、回答一覧タブでデータが存在するシステムを確認してください。");
        return;
    }

    let targetAnswers = [...freshAnswers];
    let targetName = "組織全体";
    let resultMeta: Partial<AnalysisResult> = {};

    // Filter Logic (スコープに応じて自動決定)
    if (filterMode === "USER") {
        // personal scope: 個人を選択して分析（名前はレポートに出さない）
        const u = allUsers.find((u: UserProfile) => u.id === targetValue);
        const deptName = u?.dept || "";
        const teamName = u?.team || "";
        targetName = [deptName, teamName].filter(Boolean).join(" ") || "個人分析";
        targetAnswers = targetAnswers.filter(a => a.userId === targetValue);
        resultMeta.targetUserId = targetValue;
        resultMeta.targetTeam = teamName || undefined;
        resultMeta.targetDept = deptName || undefined;
    } else if (filterMode === "DEPT") {
        targetName = targetValue;
        targetAnswers = targetAnswers.filter(a => a.dept === targetValue);
        resultMeta.targetDept = targetValue;
    } else if (filterMode === "TEAM") {
        const deptOfTeam = allUsers.find((u: UserProfile) => u.team === targetValue)?.dept;
        targetName = deptOfTeam ? `${deptOfTeam} ${targetValue}` : targetValue;
        targetAnswers = targetAnswers.filter(a => {
            const u = allUsers.find((u: UserProfile) => u.id === a.userId);
            const ansTeam = u?.team ?? a.team;
            return ansTeam === targetValue;
        });
        resultMeta.targetTeam = targetValue;
        resultMeta.targetDept = deptOfTeam;
    }

    // 階級フィルター適用（チェックされた役職のみ）
    const allPositionsChecked = selectedPositions.size === ALL_POSITION_KEYS.length;
    if (!allPositionsChecked) {
        targetAnswers = targetAnswers.filter(a => {
            const user = allUsers.find(u => u.id === a.userId);
            // allUsersに見つからない場合（削除済み等）は回答時の保存値を使用
            const position = user?.position ?? a.position;
            const roleStr = user?.role ?? a.role;
            const level = getPositionLevel(position, roleStr);
            return selectedPositions.has(levelToKey(level));
        });
        const posLabels = ALL_POSITION_KEYS
            .filter(k => selectedPositions.has(k))
            .map(k => POSITION_HIERARCHY[k]?.label || k)
            .join('・');
        if (posLabels) targetName = `${targetName}（${posLabels}）`;
        resultMeta.positionFilter = ALL_POSITION_KEYS.filter(k => selectedPositions.has(k)).join(',');
    }

    if (targetAnswers.length === 0) {
        alert("選択された対象の回答データがありません。");
        return;
    }

    setIsAnalyzing(true);
    try {
      const result = await aiRegistry.analyze(
        selectedInterview.analysisAI, 
        selectedInterview, 
        targetAnswers,
        selectedInterview.tag,
        targetName
      );
      
      // Merge meta explicitly for types
      const finalResult: AnalysisResult = {
          ...result,
          ...resultMeta,
          title: selectedInterview.tag,
          targetName,
          respondentCount: targetAnswers.length
      };

      db.saveAnalysis(finalResult);
      
      // Update local state
      setExistingAnalyses(db.getAnalyses(selectedId));
      setSelectedAnalysisResult(finalResult);

    } catch (e: any) {
      console.error(e);
      alert(`分析に失敗しました: ${e.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadReport = () => {
    if (!selectedAnalysisResult) return;
    const r = selectedAnalysisResult;
    const date = new Date(r.generatedAt).toLocaleString('ja-JP');
    const posLabel = r.positionFilter
        ? r.positionFilter.split(',').map(k => POSITION_HIERARCHY[k as PositionKey]?.label || k).filter(Boolean).join('・')
        : "";

    const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

    const section = (axis: "S"|"W"|"O"|"T", title: string, color: string) => {
      const items = r.swot?.[axis] || [];
      const rows = items.slice(0, 10).map((item, i) => `
        <tr>
          <td style="width:24px;font-weight:bold;color:${color};vertical-align:top">${i+1}</td>
          <td style="font-weight:600;vertical-align:top;padding-bottom:2px">${esc(item.item)}</td>
          <td style="color:#555;font-size:12px;vertical-align:top">スコア ${item.score}</td>
        </tr>
        <tr><td></td><td colspan="2" style="font-size:12px;color:#444;padding-bottom:8px">${esc(item.reason)}${item.action ? `<br/><span style="color:#1a7a4a">→ ${esc(item.action)}</span>` : ""}${item.reconfirm ? `<br/><span style="color:#888">要確認: ${esc(item.reconfirm)}</span>` : ""}</td></tr>`).join("");
      return `<div style="break-inside:avoid;margin-bottom:24px">
        <div style="background:${color};color:#fff;font-weight:bold;font-size:13px;padding:6px 12px;border-radius:6px 6px 0 0;letter-spacing:.05em">${esc(title)}</div>
        <div style="border:1px solid #e0e0e0;border-top:none;border-radius:0 0 6px 6px;padding:10px 12px">
          ${items.length === 0 ? '<p style="color:#aaa;font-size:12px">データなし</p>' : `<table style="width:100%;border-collapse:collapse">${rows}</table>`}
        </div></div>`;
    };

    const notes = (r.notes || []).map(n => `<li style="margin-bottom:4px">${esc(n)}</li>`).join("");

    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<title>SWOT分析レポート - ${esc(r.title)}</title>
<style>body{font-family:'Hiragino Sans','Meiryo',sans-serif;margin:32px;color:#222;line-height:1.6}
h1{font-size:20px;border-bottom:2px solid #1a7a4a;padding-bottom:8px;color:#1a7a4a}
.meta{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#555;margin:8px 0 24px}
.meta span{background:#f5f5f5;padding:2px 10px;border-radius:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.notes{margin-top:24px;background:#fffde7;border:1px solid #ffe082;border-radius:6px;padding:12px 16px}
.notes h2{font-size:14px;margin:0 0 8px;color:#7a6000}
@media print{.grid{grid-template-columns:1fr 1fr}}</style></head>
<body>
<h1>SWOT分析レポート</h1>
<div class="meta">
  <span>📋 ${esc(r.title)}</span>
  <span>対象: ${esc(r.targetName)}</span>
  <span>スコープ: ${esc(r.scope)}</span>
  ${posLabel ? `<span>階級: ${esc(posLabel)}</span>` : ""}
  <span>回答数: ${r.respondentCount}名</span>
  <span>生成: ${esc(date)}</span>
</div>
<div class="grid">
  ${section("S","STRENGTH（強み）","#2563eb")}
  ${section("W","WEAKNESS（弱み）","#dc2626")}
  ${section("O","OPPORTUNITY（機会）","#16a34a")}
  ${section("T","THREAT（脅威）","#d97706")}
</div>
${notes ? `<div class="notes"><h2>AI考察メモ</h2><ul style="margin:0;padding-left:20px">${notes}</ul></div>` : ""}
</body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `SWOT_${r.title}_${r.targetName}_${r.generatedAt.slice(0,10)}.html`.replace(/[\\/:*?"<>|]/g, "_");
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleDeleteUser = (id: string) => {
      if (confirm(`ユーザー ${id} を削除してもよろしいですか？`)) {
          db.deleteUser(id);
          refreshData();
      }
  };

  const handleSaveUser = async () => {
      if (editingUser) {
          if (!editingUser.id || !editingUser.name) {
              alert("IDと氏名は必須です。"); return;
          }

          // MFAをリセットする場合はPHPのauthテーブルにも反映する
          const isMfaReset = !editingUser.secret || editingUser.secret.startsWith("DISABLED");
          if (isMfaReset) {
              try {
                  const { gasUrl } = db.settingsDb.get();
                  const url = gasUrl?.trim();
                  if (url) {
                      const sep = url.includes('?') ? '&' : '?';
                      await fetch(`${url}${sep}action=update_secret`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: editingUser.id, secret: "DISABLED" })
                      });
                  }
              } catch (e) {
                  // サーバー側の更新失敗はローカル保存を妨げない
              }
          }

          db.saveUser(editingUser);

          // バックグラウンド任せにせず、明示的にSQLへ同期して結果を確認する
          const syncResult = await db.settingsDb.sync();
          if (!syncResult.success) {
            alert(`⚠️ ローカルへの保存は完了しましたが、SQLへの同期に失敗しました。\n${syncResult.message}`);
          }

          setUserModalOpen(false);
          setEditingUser(null);
          refreshData();
      }
  };

  const handleDeleteAllowedUser = (id: string) => {
      if (confirm(`ID: ${id} の事前登録を削除してもよろしいですか？\n※これを削除すると、該当のユーザーは新規登録に制限がかかります。`)) {
          const updated = allowedUsers.filter(u => u.id !== id);
          db.saveAllowedUsers(updated);
          refreshData();
      }
  };

  const handleSaveAllowedUser = () => {
      if (editingAllowedUser) {
          if (!editingAllowedUser.fullId || !editingAllowedUser.name) {
              alert("フルIDと氏名を入力してください。"); return;
          }
          
          let extractedId = editingAllowedUser.id;
          if (!extractedId) { // 新規登録時
              const matches = editingAllowedUser.fullId.match(/\d+/g);
              if (matches) {
                  const numStr = matches.join("");
                  extractedId = numStr.length >= 3 ? numStr.slice(-3) : numStr;
              } else {
                  extractedId = editingAllowedUser.fullId;
              }
          }
          const finalUser = { ...editingAllowedUser, id: extractedId };
          
          const updated = allowedUsers.map(u => u.id === finalUser.id ? finalUser : u);
          if (!allowedUsers.find(u => u.id === finalUser.id)) updated.push(finalUser);
          
          db.saveAllowedUsers(updated);
          setAllowedUserModalOpen(false);
          setEditingAllowedUser(null);
          refreshData();
      }
  };

  const handleDeleteInterview = (id: string, tagName: string) => {
      if (confirm(`システム「${tagName}」を削除してもよろしいですか？\n\n警告: このシステムに関連する全ての「回答データ」と「分析結果」も同時に削除されます。この操作は取り消せません。`)) {
          db.deleteInterview(id);
          refreshData();
      }
  };

  const handleSync = async () => {
      // 設定をまず保存（URLがlocalStorageに反映されるように）
      db.settingsDb.save(settings);
      
      setIsSyncing(true);
      const result = await db.settingsDb.sync();
      alert(result.message);
      setIsSyncing(false);
  };

  const handlePull = async () => {
      if (!confirm("MySQLのデータでローカルデータを上書きします。\n現在のブラウザ内データは失われます。\n\n本当に復元しますか？")) return;
      
      // 設定をまず保存（URLがlocalStorageに反映されるように）
      db.settingsDb.save(settings);

      setIsSyncing(true);
      const result = await db.settingsDb.pull();
      alert(result.message);
      if (result.success) {
          refreshData();
          window.location.reload();
      }
      setIsSyncing(false);
  };

  const handleSaveSettings = () => {
      db.settingsDb.save(settings);
      alert("設定を保存しました。");
  };

  const aiOptions = providers.map(p => ({ 
    value: p.id, 
    label: `${p.name} ${p.id === 'mock' ? '' : '(Env Config)'}` 
  }));

  const availableDepts = Array.from(new Set(allUsers.filter(u => u.dept).map(u => u.dept!)));
  const availableTeams = Array.from(new Set(allUsers.filter(u => u.team).map(u => u.team!)));
  const availableUsers = allUsers;
  
  // Data Tab: Flat lists for view/delete
  const allAnswers = db.getAnswers(); // Get all
  const allAnalyses = db.getAnalyses(); // Get all

  // Answers Tab: ソート済み回答一覧
  const sortedAnswers = [...allAnswers].sort((a, b) => {
    let aVal = '';
    let bVal = '';
    if (answerSortKey === 'userId')             { aVal = a.userId;    bVal = b.userId; }
    else if (answerSortKey === 'team')          { aVal = allUsers.find((u: UserProfile) => u.id === a.userId)?.team || ''; bVal = allUsers.find((u: UserProfile) => u.id === b.userId)?.team || ''; }
    else if (answerSortKey === 'dept')          { aVal = a.dept;      bVal = b.dept; }
    else if (answerSortKey === 'answeredAt')    { aVal = a.answeredAt; bVal = b.answeredAt; }
    else if (answerSortKey === 'surveyCreatedAt') {
      aVal = interviews.find(i => i.interviewId === a.interviewId)?.createdAt || '';
      bVal = interviews.find(i => i.interviewId === b.interviewId)?.createdAt || '';
    }
    const cmp = (aVal ?? '').localeCompare(bVal ?? '', 'ja');
    return answerSortDir === 'asc' ? cmp : -cmp;
  });
  // ソートボタン描画ヘルパー（コンポーネントではなく通常関数）
  const renderSortBtn = (col: typeof answerSortKey, label: string) => (
    <button
      key={col}
      onClick={() => { if (answerSortKey === col) { setAnswerSortDir(d => d === 'asc' ? 'desc' : 'asc'); } else { setAnswerSortKey(col); setAnswerSortDir('asc'); } }}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${answerSortKey === col ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
    >
      {label}{answerSortKey === col ? (answerSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
         <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-emerald-50 border border-emerald-100">
                 <Settings className="w-5 h-5 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-light tracking-wide text-slate-800">管理コマンドセンター</h2>
         </div>
         <div className="flex gap-2">
            <Button variant={activeTab === 'create' ? 'primary' : 'ghost'} onClick={() => setActiveTab('create')}>
                <Plus className="w-4 h-4 mr-2" /> 作成
            </Button>
            <Button variant={activeTab === 'users' ? 'primary' : 'ghost'} onClick={() => setActiveTab('users')}>
                <Users className="w-4 h-4 mr-2" /> ユーザー管理
            </Button>
            <Button variant={activeTab === 'analyze' ? 'primary' : 'ghost'} onClick={() => setActiveTab('analyze')}>
                <Zap className="w-4 h-4 mr-2" /> 分析
            </Button>
            <Button variant={activeTab === 'answers' ? 'primary' : 'ghost'} onClick={() => setActiveTab('answers')}>
                <FileText className="w-4 h-4 mr-2" /> 回答一覧
            </Button>
            <Button variant={activeTab === 'data' ? 'primary' : 'ghost'} onClick={() => setActiveTab('data')}>
                <Database className="w-4 h-4 mr-2" /> データ
            </Button>
             <Button variant={activeTab === 'sync' ? 'primary' : 'ghost'} onClick={() => setActiveTab('sync')}>
                 <RefreshCw className="w-4 h-4 mr-2" /> MySQL連携
             </Button>
         </div>
      </div>

      {activeTab === 'create' && (
        <div className="grid gap-8 lg:grid-cols-2 animate-in fade-in slide-in-from-left-4">
            <Card title="SWOTシステム・ジェネレーター" sub="AIモデルとスコープを選択して質問を生成">
                <div className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">プロジェクトタグ (システム名)</label>
                        <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="例: 戦略立案データ分析＿2024-10-01" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">スコープ</label>
                            <Select value={scope} onChange={(e) => setScope(e.target.value as any)} options={SCOPE_OPTIONS} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">質問数</label>
                            <Input type="number" min={4} max={100} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} />
                        </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-emerald-600 uppercase tracking-wider">質問生成AI</label>
                            <Select value={questionAI} onChange={(e) => setQuestionAI(e.target.value as any)} options={aiOptions} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-emerald-600 uppercase tracking-wider">分析AI</label>
                            <Select value={analysisAI} onChange={(e) => setAnalysisAI(e.target.value as any)} options={aiOptions} />
                        </div>
                        <div className="text-[10px] text-slate-400 mt-2">
                             ※ Google Geminiを選択した場合、設定タブのAPIキーが使用されます。
                        </div>
                    </div>

                    <Button onClick={handleCreate} isLoading={isCreating} className="w-full h-12 text-lg">
                        <Plus className="w-5 h-5 mr-2" />
                        インタビューシステム生成
                    </Button>
                </div>
            </Card>

            <Card title="登録済みシステム" sub="現在稼働中の設定">
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                    {interviews.length === 0 && <div className="text-slate-400 italic py-4 text-center">システムが見つかりません。</div>}
                    {interviews.map((iv) => (
                    <div key={iv.interviewId} className="group relative p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-200 transition-all">
                        <div className="flex justify-between items-start mb-2">
                            <div className="font-semibold text-slate-900">{iv.tag}</div>
                            <Badge variant={iv.scope === 'org' ? 'warning' : 'default'}>{iv.scope}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 mb-3">
                            <div>生成AI: {iv.questionAI}</div>
                            <div>作成日: {new Date(iv.createdAt).toLocaleDateString()}</div>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setPreview(iv)} className="flex-1 text-xs h-8">
                                <Eye className="w-3 h-3 mr-2" /> 内容確認
                            </Button>
                            <Button variant="ghost" onClick={() => handleDeleteInterview(iv.interviewId, iv.tag)} className="text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 h-8 w-10 px-0">
                                <Trash2 className="w-3 h-3" />
                            </Button>
                        </div>
                    </div>
                    ))}
                </div>
            </Card>
        </div>
      )}

      {activeTab === 'users' && (
          <div className="animate-in fade-in slide-in-from-right-4 space-y-6">
              
              <Card title="事前登録設定 (CSVアップロード)" sub="IDと氏名の対応リストを登録し、ログイン・アカウント作成を制御します">
                 <div className="flex items-center gap-4 mb-4">
                    <label className="flex items-center justify-center px-4 py-2 border-2 border-dashed border-emerald-300 bg-emerald-50 hover:bg-emerald-100 rounded-lg cursor-pointer transition-colors text-emerald-700 text-sm font-medium whitespace-nowrap">
                      <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                      <Upload className="w-4 h-4 mr-2" />
                      社員CSVファイルを選択
                    </label>
                    <Button variant="outline" onClick={() => { setEditingAllowedUser({ id: "", fullId: "", name: "" }); setAllowedUserModalOpen(true); }} className="whitespace-nowrap flex-shrink-0">
                        <UserPlus className="w-4 h-4 mr-2" />
                        手動で1名追加
                    </Button>
                    <div className="text-xs text-slate-500 flex-1">
                      ※ 1列目: フルID (4〜5桁), 2列目: 氏名 の形式のCSVファイル。<br/>
                      ※ IDは下3桁のみが抽出されて使用・管理されます。
                    </div>
                 </div>

                 {allowedUsers.length > 0 && (
                    <div className="overflow-x-auto max-h-[300px] border border-slate-200 rounded-lg">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase">
                                    <th className="p-3 sticky top-0 bg-slate-50">フルID</th>
                                    <th className="p-3 sticky top-0 bg-slate-50">ログインID (下3桁)</th>
                                    <th className="p-3 sticky top-0 bg-slate-50">氏名</th>
                                    <th className="p-3 sticky top-0 bg-slate-50 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {allowedUsers.map(au => (
                                    <tr key={au.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="p-3 font-mono text-slate-500">{au.fullId}</td>
                                        <td className="p-3 font-mono font-bold text-slate-700">{au.id}</td>
                                        <td className="p-3">{au.name}</td>
                                        <td className="p-3 flex gap-2 justify-end">
                                            <Button variant="ghost" className="h-8 px-2" onClick={() => { setEditingAllowedUser({...au}); setAllowedUserModalOpen(true); }}>
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" className="h-8 px-2 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => handleDeleteAllowedUser(au.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 )}
              </Card>

              <Card title="ユーザーアカウント管理" sub="登録済みユーザーの編集・削除・権限設定">
                  <div className="flex justify-end mb-4">
                     <Button variant="outline" onClick={() => { 
                         setEditingUser({ id: "", name: "", dept: "", team: "", role: "一般", isAdmin: false, password: "", secret: "DISABLED", position: "member", createdAt: new Date().toISOString() }); 
                         setUserModalOpen(true); 
                     }}>
                        <UserPlus className="w-4 h-4 mr-2" />
                        新規ユーザー追加
                     </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                <th className="p-3">ID</th>
                                <th className="p-3">氏名</th>
                                <th className="p-3">部署</th>
                                <th className="p-3">課</th>
                                <th className="p-3">役職</th>
                                <th className="p-3">権限</th>
                                <th className="p-3 text-left">パスワード</th>
                                <th className="p-3 text-left">操作</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {allUsers.map(u => (
                                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="p-3 font-mono text-slate-600">{u.id}</td>
                                    <td className="p-3 font-semibold">{u.name}</td>
                                    <td className="p-3">{u.dept || "-"}</td>
                                    <td className="p-3">{u.team || "-"}</td>
                                    <td className="p-3">
                                        <Badge variant={u.position === 'executive' ? 'warning' : u.position === 'director' || u.position === 'general_manager' ? 'success' : 'default'}>
                                            {u.position ? POSITION_HIERARCHY[u.position]?.label || u.position : "一般社員"}
                                        </Badge>
                                    </td>
                                    <td className="p-3">
                                        <Badge variant={u.role === "ADMIN" ? "success" : "secondary"}>
                                            {u.role === "ADMIN" ? "ADMIN" : "一般"}
                                        </Badge>
                                    </td>
                                    <td className="p-3 font-mono text-slate-500">
                                        {u.password ? "******" : <span className="text-red-500 text-xs">未設定</span>}
                                    </td>
                                    <td className="p-3">
                        <div className="flex items-center gap-2">
                                        <Button variant="ghost" className="h-8 px-2" onClick={() => { setEditingUser({...u}); setUserModalOpen(true); }}>
                                            <Edit2 className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" className="h-8 px-2 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => handleDeleteUser(u.id)}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
              </Card>

              <Modal open={userModalOpen} title="ユーザー編集" onClose={() => { setUserModalOpen(false); setEditingUser(null); }}>
                   {editingUser && (
                       <div className="space-y-4">
                           <div>
                               <label className="text-xs font-bold text-slate-500 uppercase">ID</label>
                               <Input value={editingUser.id} disabled={!!allUsers.find(u => u.id === editingUser.id)} onChange={e => setEditingUser({...editingUser, id: e.target.value})} className={allUsers.find(u => u.id === editingUser.id) ? "bg-slate-100 cursor-not-allowed" : ""} placeholder="例: 101" />
                           </div>
                           <div>
                               <label className="text-xs font-bold text-slate-500 uppercase">氏名</label>
                               <Input value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} />
                           </div>
                           <div>
                               <label className="text-xs font-bold text-slate-500 uppercase">部署</label>
                               <Select 
                                    value={editingUser.dept || ""} 
                                    onChange={e => setEditingUser({...editingUser, dept: e.target.value})}
                                    options={[{value: "", label: "未設定"}, ...DEPARTMENTS.map(d => ({ value: d, label: d}))]}
                                />
                           </div>
                           <div>
                               <label className="text-xs font-bold text-slate-500 uppercase">課</label>
                               <Input value={editingUser.team || ""} onChange={e => setEditingUser({...editingUser, team: e.target.value})} />
                           </div>
                           <div>
                               <label className="text-xs font-bold text-slate-500 uppercase">役職</label>
                               <Select 
                                   value={editingUser.position || "member"} 
                                   onChange={e => setEditingUser({...editingUser, position: e.target.value as PositionKey})}
                                   options={POSITION_OPTIONS}
                               />
                           </div>
                           <div>
                               <label className="text-xs font-bold text-slate-500 uppercase">権限</label>
                               <Select 
                                   value={editingUser.role === "ADMIN" || editingUser.role === "管理者" ? "ADMIN" : "一般"} 
                                   onChange={e => {
                                       const newRole = e.target.value;
                                       setEditingUser({
                                           ...editingUser, 
                                           role: newRole,
                                           // isAdmin: newRole === "ADMIN" // Removed isAdmin update
                                       });
                                   }}
                                   options={[
                                       {value: "一般", label: "一般"},
                                       {value: "ADMIN", label: "ADMIN"}
                                   ]}
                               />
                           </div>
                           <div>
                               <label className="text-xs font-bold text-slate-500 uppercase">パスワード</label>
                               <div className="flex gap-2">
                                   <Input 
                                       type="password" 
                                       placeholder="変更する場合のみ入力" 
                                       onChange={e => {
                                           setEditingUser({...editingUser, password: e.target.value || undefined});
                                       }} 
                                   />
                                   <Button 
                                        variant="ghost" 
                                        className="text-red-500 hover:bg-red-50 whitespace-nowrap"
                                        onClick={() => setEditingUser({...editingUser, password: undefined})}
                                        title="パスワードを消去して再登録を要求する"
                                   >
                                        消去
                                   </Button>
                               </div>
                               <div className="text-[10px] text-slate-400 mt-1">
                                   ※ パスワードを消去すると、次回ログイン時に再登録が要求されます。
                               </div>
                           </div>
                           <div>
                               <label className="text-xs font-bold text-slate-500 uppercase">2段階認証 (MFA) の状態</label>
                               <div className="flex gap-2 items-center">
                                   <div className="flex-1 text-sm text-slate-600 bg-slate-50 p-2 rounded border border-slate-200 flex items-center">
                                       {editingUser.secret && !editingUser.secret.startsWith("DISABLED") && editingUser.secret.length > 5 ? "✅ 登録済み" : "❌ 未設定 (次回QR表示)"}
                                   </div>
                                   <Button 
                                        variant="ghost" 
                                        className="text-red-500 hover:bg-red-50 whitespace-nowrap"
                                        onClick={() => {
                                             if (confirm("このユーザーのMFAをリセットしてよろしいですか？次回ログイン時に再びQRコードが表示されます。")) {
                                                 setEditingUser({...editingUser, secret: "DISABLED"});
                                             }
                                        }}
                                   >
                                        強制リセット
                                   </Button>
                               </div>
                               <div className="text-[10px] text-slate-400 mt-1">
                                   ※ スマホ紛失や機種変更等でログインできないユーザーを救済する場合に使用します。
                               </div>
                           </div>
                           <div className="flex gap-2 pt-4">
                               <Button onClick={handleSaveUser} className="flex-1">保存</Button>
                                <Button variant="ghost" onClick={() => setUserModalOpen(false)} className="flex-1">キャンセル</Button>
                            </div>
                        </div>
                    )}
               </Modal>

              <Modal open={allowedUserModalOpen} title="事前登録ユーザー編集" onClose={() => { setAllowedUserModalOpen(false); setEditingAllowedUser(null); }}>
                   {editingAllowedUser && (
                       <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">フルID</label>
                                <Input value={editingAllowedUser.fullId} onChange={e => setEditingAllowedUser({...editingAllowedUser, fullId: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">ログイン用ID (下3桁)</label>
                                <Input value={editingAllowedUser.id} disabled className="bg-slate-100 cursor-not-allowed" />
                                <div className="text-[10px] text-slate-400 mt-1">※ ログインIDは自動抽出されるため編集できません。変更する場合は削除して再登録してください。</div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">氏名</label>
                                <Input value={editingAllowedUser.name} onChange={e => setEditingAllowedUser({...editingAllowedUser, name: e.target.value})} />
                            </div>
                            <div className="flex gap-2 pt-4">
                                <Button onClick={handleSaveAllowedUser} className="flex-1">保存</Button>
                                <Button variant="ghost" onClick={() => setAllowedUserModalOpen(false)} className="flex-1">キャンセル</Button>
                            </div>
                       </div>
                   )}
               </Modal>
          </div>
      )}

      {activeTab === 'sync' && (
          <div className="animate-in fade-in slide-in-from-right-4 space-y-6">
              <Card title="AI モデル設定" sub="使用するGeminiモデルを変更できます（再ビルド不要）">
                  <div className="space-y-4">
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Gemini APIキー</label>
                          <Input
                              type="password"
                              placeholder="AIzaSy..."
                              value={settings.geminiApiKey || ""}
                              onChange={e => setSettings({...settings, geminiApiKey: e.target.value.trim()})}
                          />
                          <p className="text-[10px] text-slate-400">
                            ※ Google AI Studio で取得したAPIキーを入力してください。ここで設定したキーが優先されます。
                          </p>
                      </div>
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Gemini モデル名</label>
                          <Input
                              placeholder="gemini-2.5-flash"
                              value={settings.geminiModel || "gemini-2.5-flash"}
                              onChange={e => setSettings({...settings, geminiModel: e.target.value.trim()})}
                          />
                          <p className="text-[10px] text-slate-400">
                            ※ Google が新しいモデルを公開した際は、ここでモデル名を変更するだけで切り替え可能です。<br/>
                            例: gemini-2.5-flash, gemini-2.5-pro, gemini-3.0-flash など
                          </p>
                      </div>
                      <Button onClick={handleSaveSettings} variant="primary" className="w-full">AIモデル設定を保存</Button>
                  </div>
              </Card>

              <Card title="MySQL データベース連携設定" sub="データの共有とバックアップのために自社MySQLサーバーを使用します">
                  <div className="space-y-6">
                      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                          <h4 className="flex items-center text-sm font-bold text-emerald-800 mb-2">
                              <ShieldAlert className="w-4 h-4 mr-2" /> 
                              自社DB同期のメリット
                          </h4>
                          <ul className="text-xs text-emerald-700 space-y-1 list-disc list-inside">
                              <li>外部クラウドを介さず、自社サーバー内でデータが完結し安全です。</li>
                              <li>管理者が更新した社員リスト（CSV）が全社員に即時共有されます。</li>
                              <li>MySQLに保存されるため、ブラウザ履歴を消去しても安心です。</li>
                          </ul>
                      </div>

                      <div className="space-y-4">
                          <div className="space-y-2">
                              <label className="text-xs font-bold text-slate-500 uppercase">MySQL API (PHP) URL</label>
                              <Input 
                                  placeholder="https://yourserver.com/vitsw/api.php" 
                                  value={settings.gasUrl}
                                  onChange={e => setSettings({...settings, gasUrl: e.target.value})}
                              />
                              <p className="text-[10px] text-slate-400">※設置した api.php のURLを入力してください。</p>
                          </div>

                          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                              <div>
                                  <div className="text-sm font-bold text-slate-700">自動同期</div>
                                  <div className="text-[10px] text-slate-400">回答・分析の保存時に自動でMySQLへ同期</div>
                              </div>
                              <button 
                                  onClick={() => setSettings({...settings, autoSync: !settings.autoSync})}
                                  className={`w-12 h-6 rounded-full transition-colors relative ${settings.autoSync ? 'bg-emerald-500' : 'bg-slate-300'}`}
                              >
                                  <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${settings.autoSync ? 'translate-x-6' : 'translate-x-0.5'}`} />
                              </button>
                          </div>

                          <div className="flex gap-4">
                              <Button onClick={handleSaveSettings} variant="primary" className="flex-1">設定を保存</Button>
                              <div className="flex gap-2 flex-1">
                                  <Button onClick={handleSync} isLoading={isSyncing} variant="outline" className="flex-1 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200" title="現在のローカルデータをMySQLへ保存します">
                                      <Upload className="w-4 h-4 mr-2" /> MySQLへ上書き保存 (PUSH)
                                  </Button>
                                  <Button onClick={handlePull} isLoading={isSyncing} variant="outline" className="flex-1 text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200" title="MySQLからデータをローカルに復元します">
                                      <Download className="w-4 h-4 mr-2" /> MySQLから復元 (PULL)
                                  </Button>
                              </div>
                          </div>
                      </div>
                  </div>
              </Card>

              <Card title="設定手順 (管理者用)" sub="MySQLとの接続設定方法">
                  <div className="space-y-4 text-sm text-slate-600">
                      <p>1. エックスサーバーの管理画面で MySQL データベースを作成します。</p>
                      <p>2. `api.php` を開き、作成したデータベース名・ユーザ・パスワードを記述します。</p>
                      <p>3. `api.php` を FTP等でサーバー（`/vitsw/`）にアップロードします。</p>
                      <p>4. MySQLに `swot_system_state` テーブルを作成します（手順書のSQLを実行）。</p>
                      <p>5. 上記の入力欄に PHP の URL を貼り付けて保存してください。</p>
                  </div>
              </Card>
          </div>
      )}
      {activeTab === 'analyze' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Control Panel */}
                <Card className="lg:col-span-1 h-fit" title="分析コントロール">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">対象システム</label>
                            <Select 
                                value={selectedId} 
                                onChange={(e) => setSelectedId(e.target.value)} 
                                options={interviews.map(i => ({ value: i.interviewId, label: `${i.tag} (${i.scope})` }))}
                            />
                        </div>

                        {/* 分析対象: スコープに応じて自動表示 */}
                        {(() => {
                            const iv = interviews.find((i: Interview) => i.interviewId === selectedId);
                            if (!iv) return null;
                            if (iv.scope === 'org') return (
                                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-2">
                                    <Target className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span className="text-xs text-emerald-700 font-medium">全社員が分析対象です（階級フィルターで絞り込み可）</span>
                                </div>
                            );
                            if (iv.scope === 'dept') return (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                                        <Target className="w-3 h-3" /> 対象部門
                                    </label>
                                    <Select
                                        value={targetValue}
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetValue(e.target.value)}
                                        options={availableDepts.map(d => ({ value: d, label: d }))}
                                    />
                                </div>
                            );
                            if (iv.scope === 'team') return (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                                        <Target className="w-3 h-3" /> 対象課
                                    </label>
                                    <Select
                                        value={targetValue}
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetValue(e.target.value)}
                                        options={availableTeams.map(t => ({ value: t, label: t }))}
                                    />
                                </div>
                            );
                            // personal scope
                            return (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                                        <Target className="w-3 h-3" /> 対象者
                                    </label>
                                    <Select
                                        value={targetValue}
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetValue(e.target.value)}
                                        options={availableUsers.map((u: UserProfile) => ({ value: u.id, label: `${u.name}（${u.team || u.dept || u.id}）` }))}
                                    />
                                    <div className="text-[10px] text-slate-400">※ 個人名はレポートに出力されません</div>
                                </div>
                            );
                        })()}

                        {/* 階級フィルター (チェックあり=分析対象に含む) */}
                        <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-purple-700 uppercase tracking-wider flex items-center gap-1">
                                    <Users className="w-3 h-3" /> 階級フィルター
                                </label>
                                <button
                                    onClick={() => setSelectedPositions(new Set(ALL_POSITION_KEYS))}
                                    className="text-[10px] text-purple-500 hover:text-purple-700 underline"
                                >全選択</button>
                            </div>
                            <div className="space-y-1.5">
                                {POSITION_OPTIONS.map(po => (
                                    <label key={po.value} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={selectedPositions.has(po.value as PositionKey)}
                                            onChange={() => {
                                                const next = new Set(selectedPositions);
                                                if (next.has(po.value as PositionKey)) {
                                                    next.delete(po.value as PositionKey);
                                                } else {
                                                    next.add(po.value as PositionKey);
                                                }
                                                setSelectedPositions(next);
                                            }}
                                            className="accent-purple-600"
                                        />
                                        <span className={selectedPositions.has(po.value as PositionKey) ? "font-bold text-purple-700" : "text-slate-400 line-through"}>
                                            {po.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <div className="text-[10px] text-purple-400">※ チェックした役職の回答を分析対象とします。「課長代理」等は課長として集計します。</div>
                        </div>

                        <div className="bg-white border border-slate-100 rounded-lg p-3 text-center">
                             <div className="text-xs text-slate-500 mb-1">対象回答数</div>
                             <div className="text-xl font-bold text-slate-800">
                                {(() => {
                                  const base = db.getAnswers(selectedId);
                                  if (filterMode === "ALL") return base.length;
                                  if (filterMode === "USER") {
                                    const selectedUser = allUsers.find((u: UserProfile) => u.id === targetValue);
                                    return base.filter(a => allUsers.find((u: UserProfile) => u.id === a.userId)?.team === selectedUser?.team).length;
                                  }
                                  if (filterMode === "DEPT") return base.filter(a => a.dept === targetValue).length;
                                  return base.filter(a => allUsers.find((u: UserProfile) => u.id === a.userId)?.team === targetValue).length;
                                })()}
                             </div>
                        </div>

                        <Button
                            onClick={handleAnalyze}
                            isLoading={isAnalyzing}
                            className={`w-full ${(!selectedId || db.getAnswers(selectedId).length === 0) ? "opacity-60 saturate-50" : ""}`}
                        >
                            <Zap className="w-4 h-4 mr-2" />
                            分析実行・保存
                        </Button>
                        
                        <div className="border-t border-slate-100 pt-4">
                            <div className="text-xs font-bold text-slate-400 mb-2 uppercase">保存済み分析結果 (リスト)</div>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {existingAnalyses.map((res, idx) => (
                                    <button 
                                        key={idx}
                                        onClick={() => setSelectedAnalysisResult(res)}
                                        className={`w-full text-left p-2 rounded text-[10px] border transition-colors ${
                                            selectedAnalysisResult === res 
                                            ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                                            : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50"
                                        }`}
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold opacity-80">{new Date(res.generatedAt).toLocaleDateString()}</span>
                                            <span className="opacity-60">{new Date(res.generatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        </div>
                                        <div className="font-semibold truncate mb-0.5">{res.title}</div>
                                        <div className="flex justify-between items-center">
                                            <div className="truncate opacity-80">{res.targetName || "対象者不明"}</div>
                                            <div className="whitespace-nowrap bg-slate-100 px-1 rounded ml-1">{res.respondentCount}名</div>
                                        </div>
                                    </button>
                                ))}
                                {existingAnalyses.length === 0 && <div className="text-xs text-slate-400 italic">履歴なし</div>}
                            </div>
                        </div>
                    </Card>

                {/* Results View */}
                <div className="lg:col-span-2">
                    {selectedAnalysisResult ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Header */}
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex-1 min-w-0">
                                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Analysis Report</div>
                                    <h3 className="text-xl font-bold text-slate-800">{selectedAnalysisResult.title}</h3>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        <Badge color="default">対象: {selectedAnalysisResult.targetName}</Badge>
                                        {selectedAnalysisResult.positionFilter && (
                                            <Badge color="warning">
                                                {selectedAnalysisResult.positionFilter.split(',')
                                                    .map(k => POSITION_HIERARCHY[k as PositionKey]?.label || k)
                                                    .filter(Boolean).join('・')}
                                            </Badge>
                                        )}
                                        <Badge color="default">集計: {selectedAnalysisResult.respondentCount}名</Badge>
                                        <Badge color="success">{selectedAnalysisResult.scope}</Badge>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2 shrink-0">
                                    <div className="text-[10px] text-slate-400 uppercase font-medium">
                                        {new Date(selectedAnalysisResult.generatedAt).toLocaleString()}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setViewMode(v => v === "detail" ? "summary" : "detail")}
                                            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
                                        >
                                            <BarChart3 className="w-3.5 h-3.5" />
                                            {viewMode === "detail" ? "一覧表示" : "詳細表示"}
                                        </button>
                                        <button
                                            onClick={handleDownloadReport}
                                            className="text-xs px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1 transition-colors"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            レポート
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {viewMode === "summary" ? (
                                /* ① 箇条書き一目表 */
                                <div className="grid gap-4 md:grid-cols-2">
                                    {([
                                        { axis: "S" as const, label: "STRENGTH（強み）",  bg: "bg-blue-50",   border: "border-blue-200",   num: "text-blue-500",   head: "bg-blue-600" },
                                        { axis: "W" as const, label: "WEAKNESS（弱み）",  bg: "bg-red-50",    border: "border-red-200",    num: "text-red-500",    head: "bg-red-600" },
                                        { axis: "O" as const, label: "OPPORTUNITY（機会）",bg: "bg-green-50",  border: "border-green-200",  num: "text-green-600",  head: "bg-green-600" },
                                        { axis: "T" as const, label: "THREAT（脅威）",    bg: "bg-amber-50",  border: "border-amber-200",  num: "text-amber-600",  head: "bg-amber-600" },
                                    ]).map(({ axis, label, bg, border, num, head }) => {
                                        const items = selectedAnalysisResult.swot?.[axis] || [];
                                        return (
                                            <div key={axis} className={`rounded-xl border ${border} overflow-hidden`}>
                                                <div className={`${head} text-white text-xs font-bold px-4 py-2 tracking-wider`}>{label}</div>
                                                <ul className={`${bg} p-4 space-y-2`}>
                                                    {items.slice(0, 10).map((item, i) => (
                                                        <li key={i} className="flex items-start gap-2 text-sm text-slate-800">
                                                            <span className={`font-bold text-xs shrink-0 mt-0.5 ${num}`}>{i + 1}.</span>
                                                            <span>{item.item}</span>
                                                        </li>
                                                    ))}
                                                    {items.length === 0 && <li className="text-xs text-slate-400 italic">データなし</li>}
                                                </ul>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* 詳細ビュー */
                                <div className="grid gap-6 md:grid-cols-2">
                                    <SWOTSection title="STRENGTH (強み)" items={selectedAnalysisResult.swot?.S || []} colorClass="text-blue-600" />
                                    <SWOTSection title="WEAKNESS (弱み)" items={selectedAnalysisResult.swot?.W || []} colorClass="text-red-600" />
                                    <SWOTSection title="OPPORTUNITY (機会)" items={selectedAnalysisResult.swot?.O || []} colorClass="text-green-600" />
                                    <SWOTSection title="THREAT (脅威)" items={selectedAnalysisResult.swot?.T || []} colorClass="text-amber-600" />
                                </div>
                            )}

                            <Card title="AI考察メモ">
                                <ul className="list-disc list-inside text-sm text-slate-600">
                                    {(selectedAnalysisResult.notes || []).map((n, i) => <li key={i}>{n}</li>)}
                                </ul>
                            </Card>
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] rounded-2xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                            <PieChart className="w-12 h-12 mb-4 text-slate-200" />
                            <div>左側のリストから保存済み結果を選択するか、新規分析を実行してください。</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {activeTab === 'answers' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
          <Card title="全回答一覧" sub={`${sortedAnswers.length} 件`}>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs text-slate-400 self-center">ソート：</span>
              {renderSortBtn('userId',          '個人ID')}
              {renderSortBtn('team',            '課')}
              {renderSortBtn('dept',            '部')}
              {renderSortBtn('answeredAt',      '回答日付')}
              {renderSortBtn('surveyCreatedAt', 'アンケート作成日')}
            </div>

            {sortedAnswers.length === 0 && (
              <div className="text-sm text-slate-400 text-center py-8">回答データがありません</div>
            )}

            <div className="space-y-2">
              {sortedAnswers.map((ans) => {
                const iv = interviews.find(i => i.interviewId === ans.interviewId);
                const user = allUsers.find((u: UserProfile) => u.id === ans.userId);
                const isExpanded = expandedAnswerId === ans.answerId;
                return (
                  <div key={ans.answerId} className="border border-slate-100 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedAnswerId(isExpanded ? null : ans.answerId)}
                    >
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-1 text-xs">
                        <div><span className="text-slate-400">ID </span><span className="font-mono font-bold text-slate-700">{ans.userId}</span></div>
                        <div><span className="text-slate-400">氏名 </span><span className="font-bold text-slate-700">{ans.name}</span></div>
                        <div><span className="text-slate-400">課 </span><span className="text-slate-600">{user?.team || '—'}</span></div>
                        <div><span className="text-slate-400">部 </span><span className="text-slate-600">{ans.dept || '—'}</span></div>
                        <div><span className="text-slate-400">回答日 </span><span className="text-slate-600">{new Date(ans.answeredAt).toLocaleDateString('ja-JP')}</span></div>
                        <div className="col-span-2 md:col-span-3 flex items-center gap-2 flex-wrap">
                          <span className="text-slate-400 shrink-0">アンケート </span>
                          <span className="text-slate-600">{iv?.tag || ans.interviewId}</span>
                          {(ans.scope || iv?.scope) && (
                            <Badge variant={
                              (ans.scope || iv?.scope) === 'org' ? 'warning' :
                              (ans.scope || iv?.scope) === 'personal' ? 'default' : 'success'
                            } className="text-[10px] shrink-0">
                              {{ personal:'個人', team:'課', dept:'部', org:'会社' }[ans.scope || iv?.scope || ''] || (ans.scope || iv?.scope)}
                            </Badge>
                          )}
                        </div>
                        <div className="col-span-2"><span className="text-slate-400">作成日 </span><span className="text-slate-600">{iv ? new Date(iv.createdAt).toLocaleDateString('ja-JP') : '—'}</span></div>
                      </div>
                      <Badge variant="outline" className="shrink-0">{ans.responses?.length ?? 0}問</Badge>
                      <span className="text-slate-300 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-2">
                        {(!ans.responses || ans.responses.length === 0) && <p className="text-xs text-slate-400">回答内容なし</p>}
                        {(ans.responses || []).map((r, idx) => {
                          const q = iv?.questions?.find(q => q.id === r.questionId);
                          return (
                            <div key={r.questionId} className="text-xs">
                              <div className="font-medium text-slate-500">Q{idx + 1}. {q?.text || r.questionId}</div>
                              <div className="text-slate-700 mt-0.5 pl-3 border-l-2 border-indigo-200">{r.text}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'data' && (
        <div className="space-y-8 animate-in zoom-in-95">
           <div className="grid gap-6 md:grid-cols-2">
             <Card title="データバックアップ" sub="現在の全データをJSON形式でダウンロードします">
                <div className="py-8 flex justify-center">
                    <Button onClick={() => {
                        const data = db.exportDatabase();
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `YAOI_ENGINE_Backup_${new Date().toISOString().slice(0, 10)}.json`;
                        link.click();
                        URL.revokeObjectURL(url);
                    }} className="h-16 text-lg w-full max-w-xs">
                      <Download className="w-6 h-6 mr-3" />
                      バックアップを保存
                    </Button>
                </div>
             </Card>

             <Card title="データ復元" sub="バックアップファイルからデータを復元します（上書き注意）">
                 <div className="py-8 flex justify-center w-full">
                    <div className="relative w-full max-w-xs">
                      <input 
                        type="file" 
                        accept=".json" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (event) => {
                              try {
                                  const json = JSON.parse(event.target?.result as string);
                                  db.importDatabase(json);
                                  refreshData();
                                  alert("データの復元が完了しました。");
                              } catch (err) {
                                  console.error(err);
                                  alert("無効なバックアップファイルです。");
                              }
                          };
                          reader.readAsText(file);
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Button variant="primary" className="h-16 text-lg w-full pointer-events-none shadow-emerald-500/20">
                        <Upload className="w-6 h-6 mr-3" />
                        データを復元
                      </Button>
                    </div>
                 </div>
             </Card>

             {/* 回答のみ復元 */}
             <Card title="回答データのみ復元" sub="バックアップから回答だけをマージします（既存データは上書きしません）">
                 <div className="py-8 flex justify-center w-full">
                    <div className="relative w-full max-w-xs">
                      <input
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (event) => {
                              try {
                                  const json = JSON.parse(event.target?.result as string);
                                  if (!json.answers || !Array.isArray(json.answers)) {
                                      alert("このファイルに回答データが含まれていません。");
                                      return;
                                  }
                                  const current = db.getAnswers();
                                  // answerId をキーにマージ（新しい方を優先）
                                  const merged = db._mergeCollections(current, json.answers, "answerId" as any);
                                  localStorage.setItem('swot_answers', JSON.stringify(merged));
                                  db._autoSync();
                                  refreshData();
                                  const added = merged.length - current.length;
                                  alert(`回答データを復元しました。\n既存: ${current.length}件 → 復元後: ${merged.length}件（+${added}件追加）`);
                              } catch (err) {
                                  console.error(err);
                                  alert("無効なバックアップファイルです。");
                              }
                          };
                          reader.readAsText(file);
                          if (e.target) e.target.value = '';
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Button variant="outline" className="h-16 text-lg w-full pointer-events-none">
                        <Upload className="w-6 h-6 mr-3" />
                        回答のみ復元
                      </Button>
                    </div>
                 </div>
             </Card>
           </div>

           <div className="grid gap-6 md:grid-cols-2">
              {/* Answer List Management */}
              <Card title="保存された回答データ" sub="システム内に保存されている回答リスト">
                  <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                     {allAnswers.length === 0 && <div className="text-sm text-slate-400 text-center py-4">データなし</div>}
                     {allAnswers.map((ans) => {
                         const iv = interviews.find(i => i.interviewId === ans.interviewId);
                         return (
                             <div key={ans.answerId} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs">
                                 <div>
                                     <div className="font-bold text-slate-700">{ans.name} ({ans.userId})</div>
                                     <div className="text-slate-500">{iv?.tag || "Unknown System"} - {new Date(ans.answeredAt).toLocaleDateString()}</div>
                                 </div>
                                 <Badge>{iv?.scope || "?"}</Badge>
                             </div>
                         );
                     })}
                  </div>
              </Card>

              {/* Analysis List Management */}
              <Card title="保存された分析結果" sub="過去に実行・保存された分析データリスト">
                  <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                     {allAnalyses.length === 0 && <div className="text-sm text-slate-400 text-center py-4">データなし</div>}
                     {allAnalyses.map((res, idx) => (
                         <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs">
                              <div>
                                 <div className="font-bold text-slate-700">
                                     {res.targetUserId ? `個人: ${allUsers.find(u => u.id === res.targetUserId)?.name}` : 
                                      res.targetDept ? `部署: ${res.targetDept}` : 
                                      res.targetTeam ? `課: ${res.targetTeam}` : "全体集計"}
                                 </div>
                                 <div className="text-slate-500">{new Date(res.generatedAt).toLocaleString()}</div>
                              </div>
                               <div className="flex gap-2">
                                 <Badge variant="success">Saved</Badge>
                               </div>
                         </div>
                     ))}
                  </div>
              </Card>
           </div>
        </div>
      )}

      {activeTab === 'sync' && (
        <div className="space-y-6 animate-in fade-in zoom-in-95">
           <Card title="MySQL API 設定" sub="データのクラウド保存先(api.php)を設定します。">
             <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">MySQL API URL (api.phpへのパス)</label>
                    <Input 
                        value={settings.gasUrl} 
                        onChange={(e) => setSettings({ ...settings, gasUrl: e.target.value })} 
                        placeholder="./api.php" 
                    />
                    <div className="text-[10px] text-slate-400">
                      ※ サーバー上の api.php へのパスを入力してください（例: ./api.php や https://example.com/api.php）
                    </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <input 
                       type="checkbox" 
                       checked={settings.autoSync} 
                       onChange={(e) => setSettings({ ...settings, autoSync: e.target.checked })}
                       id="auto-sync"
                       className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <label htmlFor="auto-sync" className="text-sm cursor-pointer text-slate-700">保存時に自動でクラウド同期（PUSH）する</label>
                </div>
                <Button onClick={handleSaveSettings}>設定を保存</Button>
             </div>
           </Card>

           <div className="grid gap-6 md:grid-cols-2">
              <Card title="クラウドへ保存 (PUSH)" sub="ブラウザ内データをMySQLへ統合します。">
                  <div className="flex flex-col items-center justify-center py-6 space-y-4">
                      <div className="p-4 rounded-full bg-emerald-50 text-emerald-600">
                          <Upload className="w-10 h-10" />
                      </div>
                      <Button onClick={handleSync} isLoading={isSyncing} className="shadow-lg shadow-emerald-500/20">
                          今すぐ同期 (MySQLへ保存)
                      </Button>
                  </div>
              </Card>

              <Card title="クラウドから復元 (PULL)" sub="MySQLのデータを取得してブラウザを上書きします。">
                  <div className="flex flex-col items-center justify-center py-6 space-y-4">
                      <div className="p-4 rounded-full bg-amber-50 text-amber-600">
                          <Download className="w-10 h-10" />
                      </div>
                      <Button variant="outline" onClick={handlePull} isLoading={isSyncing}>
                          MySQLから全データ取得
                      </Button>
                  </div>
              </Card>
           </div>
        </div>
      )}

      <Modal open={!!preview} title="システム設計図 (プレビュー)" onClose={() => setPreview(null)}>
        {preview && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div><span className="text-slate-500">ID:</span> {preview.interviewId}</div>
              <div><span className="text-slate-500">スコープ:</span> {preview.scope}</div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">質問一覧</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {preview.questions.map((q) => (
                  <div key={q.id} className="flex gap-3 text-sm p-3 rounded-lg border border-slate-200 bg-white">
                    <span className={`font-bold w-6 text-center rounded ${
                        q.axis === 'S' ? 'text-blue-600 bg-blue-50' :
                        q.axis === 'W' ? 'text-red-600 bg-red-50' :
                        q.axis === 'O' ? 'text-green-600 bg-green-50' :
                        'text-amber-600 bg-amber-50'
                    }`}>{q.axis}</span>
                    <span className="text-slate-700">{q.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}