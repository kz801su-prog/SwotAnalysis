import React, { useEffect, useMemo, useState } from "react";
import { Card, Button, Select, Badge } from "../components/UI";
import { db } from "../services/storage";
import {
  AnalysisResult,
  UserProfile,
  Interview,
  Answer,
  PositionKey,
  POSITION_HIERARCHY,
  POSITION_OPTIONS,
} from "../types";
import { RefreshCw, Printer, Users, Briefcase, Building2, Globe } from "lucide-react";

const getPositionLevel = (position?: string): number => {
  const levels: Record<string, number> = {
    member: 1,
    manager: 2,
    director: 3,
    general_manager: 4,
    executive: 5,
  };
  return (position && levels[position]) || 1;
};

function SWOTSection({
  title,
  items,
  colorClass,
}: {
  title: string;
  items: any[];
  colorClass: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shadow-sm h-full flex flex-col">
      <div
        className={`px-4 py-3 border-b border-slate-200 text-xs font-bold tracking-wider ${colorClass} bg-slate-100/50`}
      >
        {title}
      </div>
      <div className="p-4 space-y-4 flex-1 overflow-y-auto max-h-[420px]">
        {items.length === 0 ? (
          <div className="text-xs text-slate-400 italic text-center py-8">
            分析データがありません
          </div>
        ) : (
          items.map((item, idx) => (
            <div
              key={idx}
              className="space-y-2 border-b border-slate-200/50 pb-3 last:border-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="text-[10px] font-bold bg-slate-200 text-slate-600 w-5 h-5 flex items-center justify-center rounded-full shrink-0">
                    #{idx + 1}
                  </div>
                  <div className="text-sm font-semibold text-slate-800">
                    {item.item}
                  </div>
                </div>
                <div className="text-[10px] font-mono bg-white px-2 py-1 rounded border border-slate-200 text-slate-500 shrink-0">
                  {item.score?.toFixed?.(0) ?? "-"}
                </div>
              </div>
              <div className="text-[11px] text-slate-500 italic">{item.reason}</div>
              {item.reconfirm && (
                <div className="text-[11px] rounded-lg border border-slate-100 bg-white/60 p-2 text-slate-600">
                  <span className="font-bold text-slate-400 mr-1 text-[9px] uppercase">Fact Check:</span>
                  {item.reconfirm}
                </div>
              )}
              {item.action && (
                <div className="text-[11px] rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-700">
                  <span className="font-bold mr-1 text-[9px] uppercase">Action:</span>
                  {item.action}
                </div>
              )}
              {item.detail && (
                <div className="text-[10px] rounded-lg border border-dotted border-slate-300 bg-slate-100/50 p-2 text-slate-600 whitespace-pre-wrap">
                  {item.detail}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "±0";
}

type ScopeTab = "personal" | "team" | "dept" | "org";

const SCOPE_TABS: { key: ScopeTab; label: string; icon: React.ElementType; color: string }[] = [
  { key: "personal", label: "個人",   icon: Users,     color: "indigo"  },
  { key: "team",     label: "課",     icon: Briefcase, color: "emerald" },
  { key: "dept",     label: "部",     icon: Building2, color: "blue"    },
  { key: "org",      label: "全社",   icon: Globe,     color: "amber"   },
];

export default function ManagerPage({
  user,
  overrideDept,
}: {
  user: UserProfile;
  overrideDept?: string;
}) {
  const [analyses, setAnalyses]           = useState<AnalysisResult[]>([]);
  const [interviews, setInterviews]       = useState<Interview[]>([]);
  const [answers, setAnswers]             = useState<Answer[]>([]);
  const [allUsers, setAllUsers]           = useState<UserProfile[]>([]);
  const [selectedInterviewId, setSelectedInterviewId] = useState<string>("");
  const [roleThreshold, setRoleThreshold] = useState<PositionKey>("manager");
  const [roleMode, setRoleMode]           = useState<"above" | "below">("below");
  const [selectedScope, setSelectedScope] = useState<ScopeTab>("dept");
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading]         = useState(false);

  const currentDept = overrideDept || user.dept;
  const deptTarget  = currentDept || "未設定部署";

  // ── 全スコープ分類 ────────────────────────────────────────
  const personalAnalyses = useMemo(
    () => analyses.filter((a) => a.scope === "personal"),
    [analyses],
  );
  const teamAnalyses = useMemo(
    () =>
      analyses.filter(
        (a) => a.scope === "team" && (!currentDept || a.targetDept === currentDept),
      ),
    [analyses, currentDept],
  );
  const deptAnalyses = useMemo(
    () =>
      analyses.filter(
        (a) => a.scope === "dept" && (!currentDept || a.targetDept === currentDept),
      ),
    [analyses, currentDept],
  );
  const orgAnalyses = useMemo(
    () => analyses.filter((a) => a.scope === "org"),
    [analyses],
  );

  // 現在のスコープに対応する分析一覧
  const scopedAnalyses = useMemo(() => {
    switch (selectedScope) {
      case "personal": return personalAnalyses;
      case "team":     return teamAnalyses;
      case "dept":     return deptAnalyses;
      case "org":      return orgAnalyses;
    }
  }, [selectedScope, personalAnalyses, teamAnalyses, deptAnalyses, orgAnalyses]);

  // ターゲット選択肢（team / dept のみ）
  const teamTargets = useMemo(
    () =>
      Array.from(new Set(teamAnalyses.map((a) => a.targetTeam || "").filter(Boolean))),
    [teamAnalyses],
  );
  const deptTargets = useMemo(
    () =>
      Array.from(new Set(deptAnalyses.map((a) => a.targetDept || "").filter(Boolean))),
    [deptAnalyses],
  );

  // スコープに応じたターゲットリスト
  const targetList = useMemo(() => {
    if (selectedScope === "team") return teamTargets;
    if (selectedScope === "dept") return deptTargets;
    return [];
  }, [selectedScope, teamTargets, deptTargets]);

  // 表示する分析結果（ターゲット絞り込み適用）
  const visibleAnalyses = useMemo(() => {
    let list: AnalysisResult[];
    if (selectedScope === "team") {
      list = teamAnalyses.filter(
        (a) => !selectedTarget || a.targetTeam === selectedTarget,
      );
    } else if (selectedScope === "dept") {
      list = deptAnalyses.filter(
        (a) => !selectedTarget || a.targetDept === selectedTarget,
      );
    } else {
      list = scopedAnalyses;
    }
    return list.sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    );
  }, [selectedScope, teamAnalyses, deptAnalyses, scopedAnalyses, selectedTarget]);

  // ── ライフサイクル ─────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await db.settingsDb.pull();
      setAnalyses(db.getAnalyses());
      setInterviews(db.getInterviews());
      setAnswers(db.getAnswers());
      setAllUsers(db.getAllUsers());
      setIsLoading(false);
    };
    load();
  }, []);

  // スコープ変更時にターゲット初期化
  useEffect(() => {
    if (selectedScope === "dept") {
      setSelectedTarget((v) =>
        deptTargets.includes(v) ? v : deptTargets[0] || deptTarget,
      );
    } else if (selectedScope === "team") {
      setSelectedTarget((v) =>
        teamTargets.includes(v) ? v : teamTargets[0] || "",
      );
    } else {
      setSelectedTarget("");
    }
    setSelectedAnalysis(null);
  }, [selectedScope]);

  // ターゲット変更時に分析自動選択
  useEffect(() => {
    setSelectedAnalysis(visibleAnalyses[0] || null);
  }, [visibleAnalyses]);

  // ── 年次比較 ─────────────────────────────────────────────
  const compareHistory = useMemo(() => {
    if (visibleAnalyses.length < 2) return null;
    const [latest, previous] = visibleAnalyses;
    return {
      latest,
      previous,
      delta: {
        S: latest.swot.S.length - previous.swot.S.length,
        W: latest.swot.W.length - previous.swot.W.length,
        O: latest.swot.O.length - previous.swot.O.length,
        T: latest.swot.T.length - previous.swot.T.length,
      },
    };
  }, [visibleAnalyses]);

  // ── 未回答者 ──────────────────────────────────────────────
  const selectedInterview = useMemo(
    () =>
      interviews.find((iv) => iv.interviewId === selectedInterviewId) ||
      interviews[0] ||
      null,
    [interviews, selectedInterviewId],
  );
  const roleThresholdLevel = getPositionLevel(roleThreshold);
  const departmentCandidates = useMemo(() => {
    if (!currentDept) return [];
    return allUsers.filter((u) => {
      if (!u.dept || u.dept !== currentDept) return false;
      const level = getPositionLevel(u.position);
      return roleMode === "below"
        ? level < roleThresholdLevel
        : level >= roleThresholdLevel;
    });
  }, [allUsers, roleMode, roleThreshold, currentDept]);
  const answeredUserIds = useMemo(
    () =>
      new Set(
        answers
          .filter((a) => a.interviewId === selectedInterview?.interviewId)
          .map((a) => a.userId),
      ),
    [answers, selectedInterview],
  );
  const answeredUsers   = useMemo(() => departmentCandidates.filter((u) => answeredUserIds.has(u.id)), [departmentCandidates, answeredUserIds]);
  const unansweredUsers = useMemo(() => departmentCandidates.filter((u) => !answeredUserIds.has(u.id)), [departmentCandidates, answeredUserIds]);

  // ── 印刷 ──────────────────────────────────────────────────
  const handlePrintReport = () => {
    if (!selectedAnalysis) return;
    const esc = (s?: string) =>
      String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const renderSection = (axis: "S" | "W" | "O" | "T", title: string, color: string) => {
      const items = selectedAnalysis.swot[axis] || [];
      const rows = items
        .map(
          (item, idx) => `
            <tr>
              <td style="width:26px;color:${color};font-weight:700;vertical-align:top">${idx + 1}</td>
              <td style="padding:4px 8px;vertical-align:top"><strong>${esc(item.item)}</strong><br/><span style="font-size:12px;color:#555">${esc(item.reason)}</span>${item.action ? `<div style="margin-top:6px;color:#1f5d3a;font-size:12px">→ ${esc(item.action)}</div>` : ""}${item.reconfirm ? `<div style="margin-top:4px;color:#924444;font-size:12px">要確認: ${esc(item.reconfirm)}</div>` : ""}${item.detail ? `<div style="margin-top:4px;color:#666;font-size:11px">${esc(item.detail)}</div>` : ""}</td>
            </tr>`,
        )
        .join("");
      return `
        <div style="break-inside:avoid;margin-bottom:22px">
          <div style="background:${color};color:#fff;padding:10px 14px;border-radius:8px 8px 0 0;font-weight:700">${esc(title)}</div>
          <div style="border:1px solid #e2e2e2;border-top:0;border-radius:0 0 8px 8px;padding:12px;">
            ${rows || '<div style="color:#888;font-size:13px;">データなし</div>'}
          </div>
        </div>`;
    };
    const scopeLabel = SCOPE_TABS.find((s) => s.key === selectedScope)?.label || selectedScope;
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>SWOT報告 - ${esc(selectedAnalysis.title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1f2937;margin:24px}h1{font-size:24px;color:#0f172a;margin-bottom:12px}table{width:100%;border-collapse:collapse}td{vertical-align:top}.meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;font-size:13px}.chip{background:#f1f5f9;color:#334155;padding:6px 10px;border-radius:999px;font-size:12px}@media print{.no-print{display:none}}</style></head><body><div class="no-print" style="margin-bottom:18px"><button onclick="window.print()" style="padding:10px 14px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px">印刷する</button></div><h1>SWOT分析レポート</h1><div class="meta"><span class="chip">スコープ: ${esc(scopeLabel)}</span><span class="chip">対象: ${esc(selectedAnalysis.targetName)}</span><span class="chip">生成: ${esc(new Date(selectedAnalysis.generatedAt).toLocaleString("ja-JP"))}</span><span class="chip">回答数: ${selectedAnalysis.respondentCount}名</span></div>${renderSection("S","STRENGTH（強み）","#2563eb")}${renderSection("W","WEAKNESS（弱み）","#dc2626")}${renderSection("O","OPPORTUNITY（機会）","#16a34a")}${renderSection("T","THREAT（脅威）","#d97706")}${selectedAnalysis.notes?.length ? `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;background:#f8fafc;margin-top:24px"><div style="font-weight:700;margin-bottom:8px">AI 考察メモ</div><ul style="padding-left:18px;margin:0">${selectedAnalysis.notes.map((n) => `<li style="margin-bottom:8px;color:#334155">${esc(n)}</li>`).join("")}</ul></div>` : ""}</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("ポップアップブロックを解除してから再度お試しください。"); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  };

  // ── アクセスチェック ──────────────────────────────────────
  const accessLevel = getPositionLevel(user.position);
  if (accessLevel < 3 && !user.isAdmin) {
    return (
      <Card title="権限エラー" sub="このページにアクセスする権限がありません。">
        <div className="text-sm text-slate-600">部長以上の役職でログインしてください。</div>
      </Card>
    );
  }

  // ── スコープタブのアクティブ色ヘルパー ────────────────────
  const tabColors: Record<ScopeTab, { active: string; badge: string }> = {
    personal: { active: "bg-indigo-500 text-white",   badge: "bg-indigo-100 text-indigo-700"  },
    team:     { active: "bg-emerald-500 text-white",  badge: "bg-emerald-100 text-emerald-700" },
    dept:     { active: "bg-blue-500 text-white",     badge: "bg-blue-100 text-blue-700"      },
    org:      { active: "bg-amber-500 text-white",    badge: "bg-amber-100 text-amber-700"    },
  };
  const countByScope: Record<ScopeTab, number> = {
    personal: personalAnalyses.length,
    team:     teamAnalyses.length,
    dept:     deptAnalyses.length,
    org:      orgAnalyses.length,
  };

  return (
    <div className="space-y-8">

      {/* ── ヘッダー ─────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card title="部門長管理ポータル" sub="個人・課・部・全社のSWOT分析を横断閲覧します。">
          <div className="space-y-3 text-sm text-slate-600">
            <p>すべてのスコープの分析結果を一画面で確認できます。スコープタブで切り替えてください。</p>
            <p className="text-emerald-700 font-semibold">弱みの消し込みを重視した分析傾向に基づいています。</p>
            <div className="flex flex-wrap gap-2 mt-1 text-xs">
              <Badge color="default">役職: {POSITION_HIERARCHY[user.position || "member"]?.label || "一般社員"}</Badge>
              <Badge color="default">部門: {user.dept || "未設定"}</Badge>
              <Badge color="default">課: {user.team || "なし"}</Badge>
            </div>
          </div>
        </Card>

        <Card title="分析件数サマリー" sub="スコープ別の保存済み分析件数">
          <div className="grid grid-cols-2 gap-3">
            {SCOPE_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setSelectedScope(tab.key)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    selectedScope === tab.key
                      ? `border-${tab.color}-300 bg-${tab.color}-50`
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-3.5 h-3.5 text-${tab.color}-500`} />
                    <div className="text-xs text-slate-500 font-medium">{tab.label}</div>
                  </div>
                  <div className="text-2xl font-bold text-slate-800">{countByScope[tab.key]}</div>
                  <div className="text-[10px] text-slate-400">件</div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── スコープタブ + フィルター ─────────────────────── */}
      <Card>
        <div className="space-y-4">
          {/* スコープ切替タブ */}
          <div className="flex rounded-xl overflow-hidden border border-slate-200 text-sm font-bold">
            {SCOPE_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = selectedScope === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setSelectedScope(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 transition-colors ${
                    isActive ? tabColors[tab.key].active : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {countByScope[tab.key] > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5 ${
                      isActive ? "bg-white/30 text-white" : tabColors[tab.key].badge
                    }`}>
                      {countByScope[tab.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            {/* team / dept のみターゲット選択を表示 */}
            {(selectedScope === "dept" || selectedScope === "team") && (
              <div className="space-y-1 min-w-[160px]">
                <div className="text-xs text-slate-500 font-medium">
                  {selectedScope === "dept" ? "対象部門" : "対象課"}
                </div>
                <Select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  options={
                    targetList.length > 0
                      ? targetList.map((v) => ({ value: v, label: v }))
                      : [{ value: deptTarget, label: deptTarget }]
                  }
                />
              </div>
            )}

            {/* personal / org の説明 */}
            {selectedScope === "personal" && (
              <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                個人アンケートの全分析結果（個別・集計）を表示しています
              </div>
            )}
            {selectedScope === "org" && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                全社スコープの分析結果を表示しています
              </div>
            )}

            <Button
              variant="secondary"
              onClick={async () => {
                setIsLoading(true);
                await db.settingsDb.pull();
                setAnalyses(db.getAnalyses());
                setInterviews(db.getInterviews());
                setAnswers(db.getAnswers());
                setAllUsers(db.getAllUsers());
                setIsLoading(false);
              }}
              className="ml-auto"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              最新を読み込み
            </Button>
          </div>
        </div>
      </Card>

      {/* ── 分析一覧 + 年次比較 ──────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card
          title="分析一覧"
          sub={`スコープ: ${SCOPE_TABS.find((t) => t.key === selectedScope)?.label} ${
            selectedTarget ? `/ ${selectedTarget}` : ""
          }`}
        >
          <div className="space-y-3">
            {isLoading && <div className="text-sm text-slate-500">読み込み中...</div>}
            {!isLoading && visibleAnalyses.length === 0 && (
              <div className="text-sm text-slate-500 italic p-4 text-center border border-dashed border-slate-200 rounded-xl">
                このスコープの分析結果がありません。<br/>
                管理画面の「分析」タブで分析を実行してください。
              </div>
            )}
            {visibleAnalyses.map((analysis) => (
              <button
                key={analysis.analysisId}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  selectedAnalysis?.analysisId === analysis.analysisId
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
                onClick={() => setSelectedAnalysis(analysis)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{analysis.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      対象: {analysis.targetName || "—"}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(analysis.generatedAt).toLocaleString("ja-JP")}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge color="success">{analysis.respondentCount}名</Badge>
                    <div className="flex gap-1 text-[9px] font-mono text-slate-400">
                      <span>S:{analysis.swot.S.length}</span>
                      <span>W:{analysis.swot.W.length}</span>
                      <span>O:{analysis.swot.O.length}</span>
                      <span>T:{analysis.swot.T.length}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card title="年次比較" sub="最新2回のSWOT変化">
          {compareHistory ? (
            <div className="space-y-4 text-sm text-slate-600">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">比較期間</div>
                <div className="font-semibold text-slate-800">
                  最新: {new Date(compareHistory.latest.generatedAt).toLocaleDateString("ja-JP")}
                </div>
                <div className="text-slate-500">
                  前回: {new Date(compareHistory.previous.generatedAt).toLocaleDateString("ja-JP")}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(compareHistory.delta as Record<string, number>).map(([axis, diff]) => (
                  <div key={axis} className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                    <div className="text-xs text-slate-400 uppercase tracking-widest">{axis}</div>
                    <div className={`text-xl font-bold mt-1 ${
                      Number(diff) > 0 ? "text-emerald-600" : Number(diff) < 0 ? "text-red-500" : "text-slate-500"
                    }`}>
                      {formatDelta(Number(diff))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500 italic">
              比較できる過去の分析結果が不足しています（同対象で2件以上必要）。
            </div>
          )}
        </Card>
      </div>

      {/* ── SWOT詳細 ─────────────────────────────────────── */}
      {selectedAnalysis && (
        <Card
          title="SWOT詳細"
          sub={`${SCOPE_TABS.find((t) => t.key === selectedScope)?.label} / ${selectedAnalysis.targetName}`}
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge color="default">回答数: {selectedAnalysis.respondentCount}名</Badge>
                <Badge color="default">
                  生成: {new Date(selectedAnalysis.generatedAt).toLocaleString("ja-JP")}
                </Badge>
                {selectedAnalysis.positionFilter && (
                  <Badge color="warning">
                    {selectedAnalysis.positionFilter
                      .split(",")
                      .map((k) => POSITION_HIERARCHY[k as PositionKey]?.label || k)
                      .join("・")}
                  </Badge>
                )}
              </div>
              <Button variant="secondary" onClick={handlePrintReport} className="shrink-0">
                <Printer className="w-4 h-4 mr-2" /> 印刷レポート
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SWOTSection title="STRENGTH (強み)"    items={selectedAnalysis.swot.S || []} colorClass="text-blue-600"  />
              <SWOTSection title="WEAKNESS (弱み)"    items={selectedAnalysis.swot.W || []} colorClass="text-red-600"   />
              <SWOTSection title="OPPORTUNITY (機会)" items={selectedAnalysis.swot.O || []} colorClass="text-green-600" />
              <SWOTSection title="THREAT (脅威)"      items={selectedAnalysis.swot.T || []} colorClass="text-amber-600" />
            </div>

            {selectedAnalysis.notes && selectedAnalysis.notes.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="font-semibold mb-2">AI 考察メモ（総括）</div>
                <ul className="list-disc pl-5 space-y-2">
                  {selectedAnalysis.notes.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── 未回答者 ──────────────────────────────────────── */}
      <Card title="未回答者一覧" sub="選択中アンケートに回答していない部門内メンバー">
        <div className="space-y-4 text-sm text-slate-600">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <div className="text-xs text-slate-500 mb-1">アンケート</div>
              <Select
                value={selectedInterviewId}
                onChange={(e) => setSelectedInterviewId(e.target.value)}
                options={
                  interviews.length > 0
                    ? interviews.map((iv) => ({
                        value: iv.interviewId,
                        label: `${iv.tag} (${iv.scope})`,
                      }))
                    : [{ value: "", label: "アンケートがありません" }]
                }
              />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">役職フィルター</div>
              <div className="flex gap-2">
                <Select
                  value={roleThreshold}
                  onChange={(e) => setRoleThreshold(e.target.value as PositionKey)}
                  options={POSITION_OPTIONS}
                />
                <Select
                  value={roleMode}
                  onChange={(e) => setRoleMode(e.target.value as "above" | "below")}
                  options={[
                    { value: "below", label: "未満" },
                    { value: "above", label: "以上" },
                  ]}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge color="default">対象部門: {user.dept || "未設定"}</Badge>
            <Badge color="success">回答済み: {answeredUsers.length}名</Badge>
            <Badge color="warning">未回答: {unansweredUsers.length}名</Badge>
          </div>
          {!selectedInterview ? (
            <div className="text-sm text-slate-500 italic">アンケートを選択してください。</div>
          ) : unansweredUsers.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              未回答の対象者は見つかりませんでした。
            </div>
          ) : (
            <div className="space-y-2">
              {unansweredUsers.map((userItem) => (
                <div key={userItem.id} className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-800">{userItem.name}</div>
                    <div className="text-xs text-slate-500">
                      {POSITION_HIERARCHY[userItem.position || "member"]?.label || "一般社員"}
                      {" / "}{userItem.dept || "未設定"}
                      {" / "}{userItem.team || "未設定"}
                    </div>
                  </div>
                  <Badge color="warning">未回答</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
