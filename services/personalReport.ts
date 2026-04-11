import { Answer, AnalysisResult, Interview } from "../types";

const safeFileName = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 200);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDateTime = (iso: string) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
};

export function buildPersonalSwotReportHtml(
  analysis: AnalysisResult,
  answer: Answer,
  interview: Interview,
) {
  const title = interview.tag || "個人SWOT分析";
  const fileName = safeFileName(
    `SWOT_${title}_${answer.userId}_${answer.name}_${answer.dept || "未設定"}_${answer.answeredAt.slice(0, 10)}`,
  );
  const createdAt = formatDateTime(interview.createdAt);
  const answeredAt = formatDateTime(answer.answeredAt);
  const deptLabel = answer.dept || "未設定";
  const esc = escapeHtml;

  const sectionHtml = (axis: "S" | "W" | "O" | "T", sectionTitle: string, color: string) => {
    const items = analysis.swot?.[axis] || [];
    const rows = items
      .slice(0, 10)
      .map((item, idx) => `
        <tr>
          <td style="width:24px;font-weight:bold;color:${color};vertical-align:top">${idx + 1}</td>
          <td style="font-weight:600;vertical-align:top;padding-bottom:2px">${esc(item.item)}</td>
          <td style="color:#555;font-size:12px;vertical-align:top">スコア ${item.score}</td>
        </tr>
        <tr>
          <td></td>
          <td colspan="2" style="font-size:12px;color:#444;padding-bottom:8px">${esc(item.reason)}${item.action ? `<br/><span style="color:#1a7a4a">→ ${esc(item.action)}</span>` : ""}${item.reconfirm ? `<br/><span style="color:#888">要確認: ${esc(item.reconfirm)}</span>` : ""}</td>
        </tr>`,
      )
      .join("");

    return `
      <div style="break-inside:avoid;margin-bottom:24px">
        <div style="background:${color};color:#fff;font-weight:bold;font-size:13px;padding:8px 12px;border-radius:6px 6px 0 0;letter-spacing:.05em">${esc(sectionTitle)}</div>
        <div style="border:1px solid #e0e0e0;border-top:none;border-radius:0 0 6px 6px;padding:12px">
          ${items.length === 0 ? '<p style="color:#aaa;font-size:12px">データなし</p>' : `<table style="width:100%;border-collapse:collapse">${rows}</table>`}
        </div>
      </div>`;
  };

  const notesHtml = (analysis.notes || [])
    .map((note) => `<li style="margin-bottom:4px">${esc(note)}</li>`)
    .join("");

  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)} - ${esc(answer.name)}</title><style>
      body{font-family:'Hiragino Sans','Meiryo',sans-serif;margin:32px;color:#222;line-height:1.7}
      h1{font-size:24px;border-bottom:3px solid #1f7a4a;padding-bottom:10px;color:#1f7a4a}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;color:#555;margin:18px 0 24px}
      .meta span{background:#f8faf8;padding:10px 12px;border-radius:10px;border:1px solid #e2e8f0}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
      .notes{margin-top:24px;background:#f7f9f6;border:1px solid #d7e5da;border-radius:10px;padding:16px}
      .notes h2{font-size:14px;margin:0 0 10px;color:#376747}
      @media print{.grid{grid-template-columns:1fr 1fr}};
    </style></head><body>
      <h1>${esc(title)}（個人SWOTレポート）</h1>
      <div class="meta">
        <span>アンケート名: ${esc(title)}</span>
        <span>作成日: ${esc(createdAt)}</span>
        <span>ID: ${esc(answer.userId)}</span>
        <span>氏名: ${esc(answer.name)}</span>
        <span>部門: ${esc(deptLabel)}</span>
        <span>回答日: ${esc(answeredAt)}</span>
      </div>
      <div class="grid">
        ${sectionHtml("S", "STRENGTH（強み）", "#2563eb")}
        ${sectionHtml("W", "WEAKNESS（弱み）", "#dc2626")}
        ${sectionHtml("O", "OPPORTUNITY（機会）", "#16a34a")}
        ${sectionHtml("T", "THREAT（脅威）", "#d97706")}
      </div>
      ${notesHtml ? `<div class="notes"><h2>AI考察メモ</h2><ul style="margin:0;padding-left:18px">${notesHtml}</ul></div>` : ""}
    </body></html>`;

  return { html, fileName: `${fileName}.html` };
}

export function downloadPersonalSwotReport(
  analysis: AnalysisResult,
  answer: Answer,
  interview: Interview,
) {
  const { html, fileName } = buildPersonalSwotReportHtml(analysis, answer, interview);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}
