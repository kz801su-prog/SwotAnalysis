import React, { useEffect, useState } from "react";
import { Card, Button, Input, Badge, Modal } from "../components/UI";
import { db } from "../services/storage";
import { Interview, Answer, UserProfile, AnalysisResult, POSITION_HIERARCHY } from "../types";
import { Send, User, Target, Grid, AlertTriangle, Briefcase, UserCircle, Settings, Lock, CheckCircle2, RefreshCw } from "lucide-react";

interface DashboardProps {
    user: UserProfile;
}

const SCOPE_LABELS: Record<string, string> = {
    personal: "個人",
    team: "課",
    dept: "部",
    org: "会社"
};

export default function Dashboard({ user }: DashboardProps) {
    const [interviews, setInterviews] = useState<Interview[]>([]);
    const [answers, setAnswers] = useState<Answer[]>([]);
    const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
    const [responses, setResponses] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Settings / Password Change
    const [showSettings, setShowSettings] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passError, setPassError] = useState("");
    const [passSuccess, setPassSuccess] = useState(false);

    // Analysis View
    const [showMatrix, setShowMatrix] = useState(false);
    const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);

    useEffect(() => {
        const load = async () => {
            setInterviews(db.getInterviews());
            setAnswers(db.getAnswers());
            
            // Auto-pull from SQL on load to get latest interviews/answers
            const res = await db.settingsDb.pull();
            if (res.success) {
                setInterviews(db.getInterviews());
                setAnswers(db.getAnswers());
            }
        };
        load();
    }, []);

    const handlePasswordChange = () => {
        if (newPassword.length < 6) {
            setPassError("パスワードは6文字以上で設定してください。");
            return;
        }
        if (newPassword !== confirmPassword) {
            setPassError("パスワードが一致しません。");
            return;
        }

        const updatedUser = { ...user, password: newPassword };
        db.saveUser(updatedUser);
        setPassSuccess(true);
        setPassError("");
        setTimeout(() => {
            setShowSettings(false);
            setPassSuccess(false);
            setNewPassword("");
            setConfirmPassword("");
        }, 2000);
    };

    const openInterview = (interview: Interview) => {
        setSelectedInterview(interview);
        const userAnswer = answers.find(a => a.interviewId === interview.interviewId && a.userId === user.id);
        if (userAnswer) {
            const initialResponses: Record<string, string> = {};
            userAnswer.responses.forEach(r => {
                initialResponses[r.questionId] = r.text;
            });
            setResponses(initialResponses);
        } else {
            setResponses({});
        }
    };

    const viewResults = (interviewId: string) => {
        const interview = interviews.find(i => i.interviewId === interviewId);
        if (!interview) return;

        const allResults = db.getAnalyses(interviewId);
        const userLevel = user.position ? POSITION_HIERARCHY[user.position]?.level || 1 : 1;
        let resultToShow = null;

        if (interview.scope === 'personal') {
            // 個人は本人のみ閲覧可
            resultToShow = allResults.find(r => r.targetUserId === user.id);
        } else if (interview.scope === 'team') {
            // 課は課長(level2)以上かつ自身の所属する課のみ閲覧可
            if (userLevel >= 2) {
                resultToShow = allResults.find(r => r.targetTeam === user.team);
            }
        } else if (interview.scope === 'dept') {
            // 部は部長(level3)以上かつ自身の所属する部のみ閲覧可
            if (userLevel >= 3) {
                resultToShow = allResults.find(r => r.targetDept === user.dept);
            }
        } else if (interview.scope === 'org') {
            // 会社全体は部長(level3)以上なら閲覧可
            if (userLevel >= 3) {
                resultToShow = allResults.find(r => !r.targetUserId && !r.targetDept && !r.targetTeam);
            }
        }

        if (resultToShow) {
            setCurrentAnalysis(resultToShow);
            setShowMatrix(true);
        } else {
            alert("閲覧可能な分析結果がありません。\n（分析が未実行か、または閲覧権限を満たしていない可能性があります）");
        }
    };

    const handleSubmit = async () => {
        if (!selectedInterview) return;

        setIsSubmitting(true);
        await new Promise(r => setTimeout(r, 800));

        const answer: Answer = {
            // interviewId + userId の組み合わせで常に同じIDを生成 → SQL重複を防ぐ
            answerId: `ans_${selectedInterview.interviewId}_${user.id}`,
            interviewId: selectedInterview.interviewId,
            scope: selectedInterview.scope,   // スコープを明示保存
            userId: user.id,
            name: user.name,
            dept: user.dept || "Unassigned",
            role: user.role || "一般",
            answeredAt: new Date().toISOString(),
            responses: Object.entries(responses)
                .filter(([_, text]) => (text as string).trim() !== "")
                .map(([qid, text]) => ({ questionId: qid, text: String(text) }))
        };

        db.saveAnswer(answer);
        setAnswers(db.getAnswers()); // Refresh local answers
        alert("回答を保存しました。");
        setSelectedInterview(null);
        setResponses({});
        setIsSubmitting(false);
    };

    // Split interviews by scope
    const personalInterviews = interviews.filter(i => i.scope === 'personal');
    const orgInterviews = interviews.filter(i => i.scope !== 'personal');

    const isCurrentInterviewFullyAnswered = selectedInterview &&
        answers.find(a => a.interviewId === selectedInterview.interviewId && a.userId === user.id)?.responses?.length === selectedInterview.questions.length;

    const InterviewList = ({ list, emptyMsg, isPersonal }: { list: Interview[], emptyMsg: string, isPersonal?: boolean }) => (
        <div className="space-y-3">
            {list.map(iv => {
                const userAnswer = answers.find(a => a.interviewId === iv.interviewId && a.userId === user.id);
                const answeredCount = userAnswer?.responses.length || 0;
                const isFullyAnswered = answeredCount === iv.questions.length;
                const hasStarted = answeredCount > 0;

                return (
                    <div key={iv.interviewId} className="flex flex-col gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
                        <div>
                            {!isPersonal ? (
                                <div className="mb-2">
                                    <span className="text-lg font-bold text-slate-900 mr-2">{SCOPE_LABELS[iv.scope] || iv.scope}</span>
                                    <span className="text-base font-semibold text-slate-700">{iv.tag}</span>
                                    <span className="ml-2 text-xs text-slate-500">(質問数: {iv.questions.length})</span>
                                </div>
                            ) : (
                                <div className="font-semibold text-slate-900 leading-snug">{iv.tag}</div>
                            )}

                            {isPersonal && (
                                <div className="mt-2 flex items-center gap-3">
                                    <Badge className="text-sm px-3 py-1 font-medium">{SCOPE_LABELS[iv.scope] || iv.scope}</Badge>
                                    <span className="text-xs text-slate-500">質問数: {iv.questions.length}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col gap-2 w-full mt-1">
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => openInterview(iv)}
                                    variant={isFullyAnswered ? "secondary" : "primary"}
                                    className="h-10 px-4 text-sm flex-1"
                                >
                                    {isFullyAnswered ? "回答済み" : (hasStarted ? "続きを入力" : "回答開始")}
                                </Button>
                                <Button variant="ghost" onClick={() => viewResults(iv.interviewId)} className="h-10 px-3">
                                    <Grid className="w-5 h-5" />
                                </Button>
                            </div>
                            {isPersonal && (
                                <Button
                                    variant="ghost"
                                    onClick={() => viewResults(iv.interviewId)}
                                    className="w-full text-xs h-8 border-slate-200 text-slate-600 hover:text-emerald-600"
                                >
                                    貴方の回答のSWOT分析
                                </Button>
                            )}
                        </div>
                    </div>
                );
            })}
            {list.length === 0 && <div className="text-slate-400 italic text-center py-4 text-xs">{emptyMsg}</div>}
        </div>
    );

    return (
        <div className="space-y-8">
            {/* Header Profile */}
            <div className="bg-white border-b border-slate-200 pb-8 -mt-8 pt-8 px-4 -mx-4 shadow-sm">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Emerald Accent for Profile */}
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center border-2 border-emerald-100">
                            <User className="w-8 h-8 text-emerald-500" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-bold text-slate-800">{user.name}</h2>
                                <Badge variant={String(user.id) === "692" ? "success" : "secondary"} className="bg-slate-100">{user.role}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-2">
                                <span className="font-medium text-slate-400">ID: {user.id}</span>
                                <span className="flex items-center text-slate-700 font-semibold">
                                    <Briefcase className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                                    {user.dept || "所属部署未設定"}
                                </span>
                                {user.team && (
                                    <span className="flex items-center text-slate-600">
                                        <span className="text-slate-300 mr-2">/</span>
                                        {user.team}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                         <Button 
                            variant="ghost" 
                            onClick={async () => {
                                const res = await db.settingsDb.pull();
                                if (res.success) {
                                    setInterviews(db.getInterviews());
                                    setAnswers(db.getAnswers());
                                }
                                alert(res.message);
                            }} 
                            className="p-3 rounded-full hover:bg-emerald-50 text-emerald-600 transition-colors"
                            title="最新データを受信 (Pull)"
                        >
                            <RefreshCw className="w-5 h-5" />
                        </Button>
                         <Button variant="ghost" onClick={() => setShowSettings(true)} className="p-3 rounded-full hover:bg-slate-100 text-slate-400 hover:text-emerald-600 transition-colors">
                            <Settings className="w-6 h-6" />
                         </Button>
                    </div>
                </div>
            </div>

            {/* Password Change Modal */}
            <Modal open={showSettings} title="個人設定・パスワード変更" onClose={() => setShowSettings(false)}>
                <div className="space-y-6">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-widest">所属情報の確認</div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-[10px] text-slate-400">事業部</div>
                                <div className="text-sm font-medium text-slate-700">{user.dept || "未設定"}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-400">課・チーム</div>
                                <div className="text-sm font-medium text-slate-700">{user.team || "未設定"}</div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">パスワード変更</div>
                        {passSuccess ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-emerald-700 animate-in zoom-in-95">
                                <CheckCircle2 className="w-5 h-5" />
                                <span className="text-sm font-medium">パスワードを更新しました。</span>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-500">新しいパスワード</label>
                                    <Input
                                        type="password"
                                        placeholder="6文字以上で入力"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-500">新しいパスワード（確認）</label>
                                    <Input
                                        type="password"
                                        placeholder="もう一度入力"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                    />
                                </div>
                                {passError && <div className="text-xs text-red-500 font-medium">{passError}</div>}
                                <Button onClick={handlePasswordChange} className="w-full mt-2">
                                    <Lock className="w-4 h-4 mr-2" />
                                    パスワードを更新する
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </Modal>

            {!selectedInterview ? (
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Left Column: Personal */}
                    <Card>
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                            <UserCircle className="w-5 h-5 text-emerald-600" />
                            <h3 className="font-bold text-slate-800">貴方自身への質問</h3>
                        </div>
                        <InterviewList list={personalInterviews} emptyMsg="現在、個人的な質問事項はありません。" isPersonal />
                    </Card>

                    {/* Right Column: Organization */}
                    <Card>
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                            <Briefcase className="w-5 h-5 text-emerald-600" />
                            <h3 className="font-bold text-slate-800">組織の一員としての質問</h3>
                        </div>
                        <InterviewList list={orgInterviews} emptyMsg="現在、組織に関する質問事項はありません。" />
                    </Card>
                </div>
            ) : (
                <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <Button variant="ghost" onClick={() => setSelectedInterview(null)} className="pl-0 hover:bg-transparent text-slate-500">← 戻る</Button>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">{selectedInterview.tag}</h3>
                        </div>
                        <Badge className="text-sm px-3 py-1" color={selectedInterview.scope === 'org' ? 'warning' : 'default'}>
                            {SCOPE_LABELS[selectedInterview.scope] || selectedInterview.scope}
                        </Badge>
                    </div>

                    <div className="grid gap-6">
                        {selectedInterview.questions.map((q) => (
                            <div key={q.id} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm transition-colors">
                                <div className="flex gap-3 mb-4">
                                    <span className="text-slate-700 font-medium text-lg leading-relaxed flex-1">{q.text}</span>
                                </div>
                                <Input
                                    placeholder="あなたの考えや、具体的なエピソードを教えてください..."
                                    value={responses[q.id] || ""}
                                    onChange={(e) => setResponses({ ...responses, [q.id]: e.target.value })}
                                    className="bg-slate-50"
                                    disabled={isCurrentInterviewFullyAnswered}
                                />
                            </div>
                        ))}
                    </div>

                    {!isCurrentInterviewFullyAnswered && (
                        <div className="pt-4 pb-12">
                            <Button onClick={handleSubmit} isLoading={isSubmitting} className="w-full h-14 text-lg shadow-xl shadow-emerald-500/20">
                                <Send className="w-5 h-5 mr-2" />
                                安全に送信する
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* SWOT Matrix Modal - Keeping standard SWOT colors for the matrix itself as semantic meaning, but UI accents are Red */}
            <Modal open={showMatrix} title={`戦略マトリックス (${currentAnalysis?.targetUserId ? '個人分析' : (currentAnalysis?.targetDept ? `${currentAnalysis.targetDept}分析` : (currentAnalysis?.targetTeam ? `${currentAnalysis.targetTeam}分析` : '全体集計'))})`} onClose={() => setShowMatrix(false)}>
                {currentAnalysis ? (
                    <div className="space-y-8">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="border-r border-b border-slate-200 p-4 min-h-[200px]">
                                <div className="text-blue-600 font-bold mb-3 text-sm tracking-wider">STRENGTH (強み)</div>
                                <ul className="space-y-2">
                                    {currentAnalysis.swot.S.map((i, idx) => (
                                        <li key={idx} className="text-xs text-slate-600">• {i.item}</li>
                                    ))}
                                </ul>
                            </div>
                            <div className="border-b border-slate-200 p-4 min-h-[200px]">
                                <div className="text-red-600 font-bold mb-3 text-sm tracking-wider">WEAKNESS (弱み)</div>
                                <ul className="space-y-2">
                                    {currentAnalysis.swot.W.map((i, idx) => (
                                        <li key={idx} className="text-xs text-slate-600">• {i.item}</li>
                                    ))}
                                </ul>
                            </div>
                            <div className="border-r border-slate-200 p-4 min-h-[200px]">
                                <div className="text-green-600 font-bold mb-3 text-sm tracking-wider">OPPORTUNITY (機会)</div>
                                <ul className="space-y-2">
                                    {currentAnalysis.swot.O.map((i, idx) => (
                                        <li key={idx} className="text-xs text-slate-600">• {i.item}</li>
                                    ))}
                                </ul>
                            </div>
                            <div className="p-4 min-h-[200px]">
                                <div className="text-amber-600 font-bold mb-3 text-sm tracking-wider">THREAT (脅威)</div>
                                <ul className="space-y-2">
                                    {currentAnalysis.swot.T.map((i, idx) => (
                                        <li key={idx} className="text-xs text-slate-600">• {i.item}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-4">
                            <AlertTriangle className="w-8 h-8 text-red-500" />
                            <div>
                                <div className="text-red-800 font-bold uppercase tracking-widest text-sm">重要</div>
                                <div className="text-red-600 text-xs">潜在的な弱み（Weakness）が検出されています。組織的な対応が必要です。</div>
                            </div>
                        </div>
                    </div>
                ) : <p className="text-slate-500">データがありません。</p>}
            </Modal>
        </div>
    );
}