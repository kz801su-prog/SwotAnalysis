# 開発ガイド

## アーキテクチャ

### 個人SWOT分析ワークフロー
- Dashboard で個人インタビュー回答
- 自動で aiRegistry.analyze() を実行
- 結果を db.saveAnalysis() で保存
- personalReport.ts でダウンロード

### ファイル構造
- `services/personalReport.ts` - レポート生成・ダウンロード共通処理
- `pages/Dashboard.tsx` - ユーザーが回答・確認
- `pages/Admin.tsx` - 管理者が遡って出力

## 今後の実装予定
- [ ] 複数年度の比較分析
- [ ] CSV export
- [ ] バッチ処理…