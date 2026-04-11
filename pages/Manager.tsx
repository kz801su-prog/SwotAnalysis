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
import { RefreshCw } from "lucide-react";

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
                <div className="text-sm font-semibold text-slate-800">
                  {item.item}
                </div>
                <div className="text-[10px] font-mono bg-white px-2 py-1 rounded border border-slate-200 text-slate-500">
                  {item.score?.toFixed?.(0) ?? "-"}
                </div>
              </div>
              <div className="text-[11px] text-slate-500">{item.reason}</div>
              {item.action && (
                <div className="text-[11px] rounded-lg border border-red-200 bg-red-50 p-2 text-red-700">
                  <span className="font-bold">改善アクション:</span>{" "}
                  {item.action}
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

export default function ManagerPage({
  user,
  overrideDept,
}: {
  user: UserProfile;
  overrideDept?: string;
}) {
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedInterviewId, setSelectedInterviewId] = useState<string>("");
  const [roleThreshold, setRoleThreshold] = useState<PositionKey>("manager");
  const [roleMode, setRoleMode] = useState<"above" | "below">("below");
  const [selectedScope, setSelectedScope] = useState<"dept" | "team">("dept");
  const [selectedTarget, setSelectedTarget] = useState<string>(user.dept || "");
  const [selectedAnalysis, setSelectedAnalysis] =
    useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const currentDept = overrideDept || user.dept;
  const deptTarget = currentDept || "未設定部署";

  const filteredAnalyses = useMemo(() => {
    if (!currentDept) return [];
    return analyses.filter((a) => {
      if (a.scope === "dept") {
        return a.targetDept === currentDept;
      }
      if (a.scope === "team") {
        return a.targetDept === currentDept;
      }
      return false;
    });
  }, [analyses, currentDept]);

  const deptTargets = useMemo(
    () =>
      Array.from(
        new Set(
          filteredAnalyses
            .filter((a) => a.scope === "dept")
            .map((a) => a.targetDept || ""),
        ),
      ).filter(Boolean),
    [filteredAnalyses],
  );

  const teamTargets = useMemo(
    () =>
      Array.from(
        new Set(
          filteredAnalyses
            .filter((a) => a.scope === "team")
            .map((a) => a.targetTeam || ""),
        ),
      ).filter(Boolean),
    [filteredAnalyses],
  );

  const targetList = selectedScope === "dept" ? deptTargets : teamTargets;

  const visibleAnalyses = useMemo(() => {
    if (!selectedTarget) return [];
    return filteredAnalyses
      .filter((a) => {
        if (selectedScope === "dept") {
          return a.scope === "dept" && a.targetDept === selectedTarget;
        }
        return a.scope === "team" && a.targetTeam === selectedTarget;
      })
      .sort(
        (a, b) =>
          new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
      );
  }, [filteredAnalyses, selectedScope, selectedTarget]);

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

  useEffect(() => {
    if (!selectedTarget) {
      const firstTarget =
        targetList[0] || (selectedScope === "dept" ? deptTarget : "");
      setSelectedTarget(firstTarget);
      return;
    }
    if (!targetList.includes(selectedTarget) && targetList.length > 0) {
      setSelectedTarget(targetList[0]);
    }
  }, [targetList, selectedScope, selectedTarget, deptTarget]);

  useEffect(() => {
    setSelectedAnalysis(visibleAnalyses[0] || null);
  }, [visibleAnalyses]);

  const deptAnalyses = useMemo(
    () => filteredAnalyses.filter((a) => a.scope === "dept"),
    [filteredAnalyses],
  );

  const teamAnalyses = useMemo(
    () => filteredAnalyses.filter((a) => a.scope === "team"),
    [filteredAnalyses],
  );

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

  const answeredUsers = useMemo(
    () => departmentCandidates.filter((u) => answeredUserIds.has(u.id)),
    [departmentCandidates, answeredUserIds],
  );

  const unansweredUsers = useMemo(
    () => departmentCandidates.filter((u) => !answeredUserIds.has(u.id)),
    [departmentCandidates, answeredUserIds],
  );

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

  const accessLevel = getPositionLevel(user.position);
  if (accessLevel < 2 && !user.isAdmin) {
    return (
      <Card title="権限エラー" sub="このページにアクセスする権限がありません。">
        <div className="text-sm text-slate-600">
          課長以上の役職でログインしてください。
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card
          title="部長管理ポータル"
          sub="自部門と配下課のSWOTを確認・年度変化を把握します。"
        >
          <div className="space-y-4 text-sm text-slate-600">
            <p>
              本画面では、部長以上が自部門・配下課のSWOT結果を閲覧できます。
            </p>
            <p className="text-emerald-700 font-semibold">
              この管理画面は弱みの消し込みを重視した分析傾向に基づいています。
            </p>
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-500">
              <Badge color="default">
                役職:{" "}
                {POSITION_HIERARCHY[user.position || "member"]?.label ||
                  "一般社員"}
              </Badge>
              <Badge color="default">部門: {user.dept || "未設定"}</Badge>
              <Badge color="default">課: {user.team || "なし"}</Badge>
            </div>
          </div>
        </Card>

        <Card title="対象集計" sub="部門 / 課別のSWOT分析対象を選択">
          <div className="space-y-4">
            <div>
              <div className="text-xs text-slate-500 mb-2">対象の粒度</div>
              <Select
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value as any)}
                options={[
                  { value: "dept", label: "部単位" },
                  { value: "team", label: "課単位" },
                ]}
              />
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-2">対象</div>
              <Select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                options={
                  targetList.length > 0
                    ? targetList.map((value) => ({ value, label: value }))
                    : [{ value: deptTarget, label: deptTarget }]
                }
              />
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-2">アンケート</div>
              <Select
                value={selectedInterviewId}
                onChange={(e) => setSelectedInterviewId(e.target.value)}
                options={
                  interviews.length > 0
                    ? interviews.map((iv) => ({
                        value: iv.interviewId,
                        label: `${iv.tag} (${iv.scope})`,
                      }))
                    : [{ value: "", label: "対象のアンケートがありません" }]
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-500 mb-2">
                  役職フィルター
                </div>
                <Select
                  value={roleThreshold}
                  onChange={(e) =>
                    setRoleThreshold(e.target.value as PositionKey)
                  }
                  options={POSITION_OPTIONS}
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-2">対象範囲</div>
                <Select
                  value={roleMode}
                  onChange={(e) =>
                    setRoleMode(e.target.value as "above" | "below")
                  }
                  options={[
                    { value: "below", label: "未満" },
                    { value: "above", label: "以上" },
                  ]}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
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
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                最新を読み込み
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card title="分析一覧" sub="選択した対象のSWOT分析結果">
          <div className="space-y-3">
            <div className="text-xs text-slate-500">
              表示中: {selectedScope === "dept" ? "部" : "課"}{" "}
              {selectedTarget || deptTarget}
            </div>
            <div className="space-y-3">
              {isLoading && (
                <div className="text-sm text-slate-500">読み込み中...</div>
              )}
              {!isLoading && visibleAnalyses.length === 0 && (
                <div className="text-sm text-slate-500 italic">
                  分析結果が見つかりません。対象の回答と分析が存在するか確認してください。
                </div>
              )}
              {visibleAnalyses.map((analysis) => (
                <button
                  key={analysis.analysisId}
                  className={`w-full text-left rounded-xl border px-4 py-3 ${selectedAnalysis?.analysisId === analysis.analysisId ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  onClick={() => setSelectedAnalysis(analysis)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800">
                        {analysis.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(analysis.generatedAt).toLocaleString()}
                      </div>
                    </div>
                    <Badge color="success">{analysis.respondentCount}名</Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card title="年次比較" sub="最新2回のSWOT変化を確認">
          {compareHistory ? (
            <div className="space-y-4 text-sm text-slate-600">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">
                  最近の比較
                </div>
                <div className="font-semibold text-slate-800">
                  最新:{" "}
                  {new Date(
                    compareHistory.latest.generatedAt,
                  ).toLocaleDateString()}
                </div>
                <div className="text-slate-500">
                  前回:{" "}
                  {new Date(
                    compareHistory.previous.generatedAt,
                  ).toLocaleDateString()}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(
                  compareHistory.delta as Record<string, number>,
                ).map(([axis, diff]) => (
                  <div
                    key={axis}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="text-xs text-slate-400 uppercase tracking-widest">
                      {axis}
                    </div>
                    <div className="text-xl font-semibold">
                      {formatDelta(diff)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
                <div className="font-semibold">注意</div>
                <p>
                  本年次比較では「弱みを消し込む」改善観点を重視したレポート評価になっています。
                </p>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">
              比較対象となる過去の分析結果が不足しています。
            </div>
          )}
        </Card>
      </div>

      {selectedAnalysis && (
        <div className="space-y-4">
          <Card
            title="SWOT詳細"
            sub={`対象: ${selectedScope === "dept" ? "部" : "課"} ${selectedTarget}`}
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                本レポートは弱みの消し込みを重視した分析傾向を持ち、改善アクションを優先しています。
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <SWOTSection
                  title="STRENGTH (強み)"
                  items={selectedAnalysis.swot.S || []}
                  colorClass="text-blue-600"
                />
                <SWOTSection
                  title="WEAKNESS (弱み)"
                  items={selectedAnalysis.swot.W || []}
                  colorClass="text-red-600"
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <SWOTSection
                  title="OPPORTUNITY (機会)"
                  items={selectedAnalysis.swot.O || []}
                  colorClass="text-green-600"
                />
                <SWOTSection
                  title="THREAT (脅威)"
                  items={selectedAnalysis.swot.T || []}
                  colorClass="text-amber-600"
                />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="font-semibold mb-2">レポート全体ノート</div>
                <ul className="list-disc pl-5 space-y-2">
                  {(selectedAnalysis.notes || []).map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card title="部門・課別統計" sub="可視化対象の分析件数">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-slate-500">部分析件数</div>
            <div className="mt-2 text-2xl font-semibold text-slate-800">
              {deptAnalyses.length || 0}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-slate-500">課分析件数</div>
            <div className="mt-2 text-2xl font-semibold text-slate-800">
              {teamAnalyses.length || 0}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="未回答者一覧"
        sub="選択中のアンケートに回答していない部門内メンバーを表示"
      >
        <div className="space-y-4 text-sm text-slate-600">
          <div className="flex flex-wrap gap-3">
            <Badge color="default">対象部門: {user.dept || "未設定"}</Badge>
            <Badge color="default">
              役職フィルター:{" "}
              {POSITION_HIERARCHY[roleThreshold]?.label || roleThreshold}
            </Badge>
            <Badge color="default">
              対象範囲: {roleMode === "below" ? "未満" : "以上"}
            </Badge>
            <Badge color="default">回答済み: {answeredUsers.length}名</Badge>
            <Badge color="default">未回答: {unansweredUsers.length}名</Badge>
          </div>
          {!selectedInterview ? (
            <div className="text-sm text-slate-500 italic">
              アンケートが選択されていません。上部で対象のアンケートを選択してください。
            </div>
          ) : unansweredUsers.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              現在、選択中アンケートに未回答の対象者は見つかりませんでした。
            </div>
          ) : (
            <div className="space-y-3">
              {unansweredUsers.map((userItem) => (
                <div
                  key={userItem.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-800">
                        {userItem.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {userItem.position || "役職なし"} /{" "}
                        {userItem.dept || "未設定"} /{" "}
                        {userItem.team || "未設定"}
                      </div>
                    </div>
                    <Badge color="warning">未回答</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
