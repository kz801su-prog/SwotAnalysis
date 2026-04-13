/**
 * MySQLサーバーから社員情報を取得してCSVへ書き出すスクリプト
 * Usage: node export_users.mjs
 */

import { writeFileSync } from "fs";

// ===== 設定 =====
const API_URL = "https://kz801xs.xsrv.jp/vitsw/api.php";
const OUTPUT_FILE = "users_export.csv";

// 役職マップ（types.ts の POSITION_HIERARCHY と同期）
const POSITION_LABELS = {
  member:          "一般社員",
  manager:         "課長",
  director:        "部長",
  general_manager: "本部長",
  executive:       "取締役",
};

// ===== メイン =====
async function main() {
  console.log(`📡  ${API_URL} からデータ取得中…`);

  const res = await fetch(`${API_URL}?t=${Date.now()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(`JSON以外のレスポンス:\n${text.slice(0, 500)}`);
  }

  const data = await res.json();

  if (data?.success === false) {
    throw new Error(`APIエラー: ${data.message}`);
  }

  const users = data?.users ?? [];

  if (users.length === 0) {
    console.warn("⚠  usersデータが空です。");
    return;
  }

  console.log(`✅  ${users.length} 件の社員データを取得しました。`);

  // ===== CSV 生成 =====
  const HEADERS = [
    "社員番号",
    "氏名",
    "部署",
    "課",
    "役職コード",
    "役職名",
    "権限ロール",
    "管理者フラグ",
    "作成日時",
    "更新日時",
  ];

  const escape = (v) => {
    if (v === undefined || v === null) return "";
    const s = String(v);
    // ダブルクォートをエスケープし、カンマ・改行を含む場合はクォートで囲む
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = users.map((u) => [
    u.id ?? "",
    u.name ?? "",
    u.dept ?? "",
    u.team ?? "",
    u.position ?? "",
    POSITION_LABELS[u.position] ?? "",
    u.role ?? "",
    u.isAdmin ? "true" : "false",
    u.createdAt ?? "",
    u.updatedAt ?? "",
  ]);

  const csvLines = [
    HEADERS.join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ];

  const bom = "\uFEFF"; // Excel で文字化けしないよう BOM を付与
  writeFileSync(OUTPUT_FILE, bom + csvLines.join("\r\n"), "utf-8");

  console.log(`💾  ${OUTPUT_FILE} に書き出し完了 (${rows.length} 行)`);
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
