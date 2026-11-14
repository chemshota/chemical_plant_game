# AGENT.md

このファイルはこのリポジトリで作業するAIコーディングエージェント (Claude Code、Cursor、Copilot 等) 向けのガイドです。`CLAUDE.md` はこのファイルへのシンボリックリンクです。

---

## プロジェクト概要

19〜20世紀の化学工業史をたどる、ターン制の工場レイアウト型経営ゲームです。敷地のタイルグリッドに装置を置き、物質ごとの配管でつなぎ、副生成物と連産品の行き先を設計します。

**Vite 5 + TypeScript (strict) + Vitest** で構成しています。UI フレームワークは使わず、敷地は Canvas 2D、パネルは素の DOM です。Node は 18 系で動く版に固定しています。

ユーザー向けの詳細は `README.md` を参照してください。

## コマンド

```bash
npm install        # 初回のみ
npm run dev        # 開発サーバー (http://localhost:5173/)
npm test           # Vitest (シミュレーションの単体テストと通しプレイ)
npm run typecheck  # 型検査のみ
npm run build      # 型検査 + dist/ へビルド (dist/ は静的配信するだけで動く)
```

変更したら `npm test` と `npm run build` を通してください。UI を変えたときは `npm run dev` で開き、次を確認します。

- Console にエラーが出ないこと
- 装置の配置 / 配管の敷設 / 「次の期へ」/ 契約の受注 / 研究 が破綻しないこと
- 再読み込みで進行が復元されること (毎期 localStorage に自動保存)

## ファイル構成と責務

現在のソースファイル一覧 (この一覧は `scripts/update-agent-md.py` により自動生成されます。手で編集しないでください):

<!-- BEGIN:FILE-TREE -->
```
index.html
src/data/chemicals.ts
src/data/devices.ts
src/data/eras.ts
src/data/events.ts
src/data/techs.ts
src/main.ts
src/sim/contracts.ts
src/sim/era.ts
src/sim/events.ts
src/sim/finance.ts
src/sim/grid.ts
src/sim/market.ts
src/sim/network.ts
src/sim/production.ts
src/sim/research.ts
src/sim/rng.ts
src/sim/save.ts
src/sim/state.ts
src/sim/turn.ts
src/ui/app.ts
src/ui/format.ts
src/ui/input.ts
src/ui/panels.ts
src/ui/renderer.ts
src/ui/style.css
tests/helpers.ts
tests/playthrough.test.ts
tests/sim.test.ts
```
<!-- END:FILE-TREE -->

各ディレクトリの責務 (こちらは手動メンテナンス。新規ファイル追加時は追記してください):

| 場所 | 責務 |
|---|---|
| `index.html` | エントリポイント。`src/main.ts` を読み込む |
| `src/data/` | 静的データ定義のみ。物質 (`chemicals.ts`)、装置と製法 (`devices.ts`)、技術ツリー (`techs.ts`)、時代・目標・規制 (`eras.ts`)、顧客名とイベント (`events.ts`) |
| `src/sim/state.ts` | `GameState` の型と初期状態、技術による補正 (`getMods`) |
| `src/sim/grid.ts` | 装置の配置・撤去、配管の敷設・撤去、敷地拡張 |
| `src/sim/network.ts` | 配管網の検出 (`findNetworks`) と物質の配分 (`distribute`) |
| `src/sim/production.ts` | 受入・反応・出荷・放出、稼働率と停止理由の判定 |
| `src/sim/market.ts` | 価格変動とスポット販売 |
| `src/sim/contracts.ts` | 引き合いの生成、受注、納入と違約金、信用 |
| `src/sim/finance.ts` | 固定費、借入、汚染の罰金、企業価値、破産判定 |
| `src/sim/era.ts` / `events.ts` / `research.ts` | 時代目標と時代の進行 / イベント / 研究 |
| `src/sim/turn.ts` | 1期の処理順 (`endTurn`) |
| `src/sim/save.ts` / `rng.ts` | セーブの直列化 / シード付き乱数 |
| `src/ui/app.ts` | 画面で共有する状態 (`game` `ui`) と再描画の起点 (`refresh` `redrawBoard`) |
| `src/ui/renderer.ts` / `input.ts` | 敷地の Canvas 描画 / マウス・キーボード操作 |
| `src/ui/panels.ts` | ヘッダー・ツールバー・右パネル・モーダルの描画とボタン操作 |
| `tests/` | `sim.test.ts` (単体)、`playthrough.test.ts` (シード固定の通しプレイで採算を検証)、`helpers.ts` (定石レイアウト) |

### ファイル一覧の自動更新

ファイルの追加・削除・リネームは `scripts/update-agent-md.py` を実行することで上のツリー部分に反映されます。Claude Code の `PostToolUse` フック (`.claude/settings.json`) からも自動実行されます。

## アーキテクチャ上の重要な前提

- **`src/sim/` は DOM に依存させない**: 純粋な関数で `GameState` を書き換えるだけにし、Vitest で検証します。`window` `document` `localStorage` を直接触るのは `src/ui/` だけです。
- **状態の一元管理**: ゲーム状態は `GameState` 1つに集約し、そのまま JSON にしてセーブします。関数や `Map`/`Set` など JSON にできないものを入れないでください。フィールドを増減したら `SAVE_VERSION` を上げます。
- **乱数は `src/sim/rng.ts` だけを使う**: `Math.random` を使うと、セーブ後の再現性と通しプレイのテストが壊れます。
- **1期の処理順** (`turn.ts`): 生産 → 配管による配分 → 契約納入 → スポット販売 → 決算 → イベント → 相場更新 → 引き合い更新 → 時代判定 → 破産判定。装置は入出力バッファ (1期分の2倍) を持ち、1段につき1期の遅れで物質が流れます。
- **配分の優先度** (`network.ts`): 反応装置 → 貯槽 → 出荷 → 放出・投棄。貯槽は反応装置の不足分にだけ払い出します。
- **UI の更新**: `GameState` を書き換えたら `refresh()` (全体再描画 + 自動保存)。マウス移動など敷地だけの更新は `redrawBoard()`。ボタンは `data-act` / `data-arg` 属性を付け、`panels.ts` の `handleAction` で処理します。

## コーディング規約

- **言語**: 画面表示テキスト・ログ・コメント・テスト名は **日本語**。
- **インデント**: スペース2つ。**クォート**: シングルクォート。
- **金額表示**: `src/ui/format.ts` の `yen()` (例: `¥12,000`)、数量は `qty()` を使う。
- **コメント**: 過剰な説明コメントは追加しない。ファイル先頭や区切りには `// ===…` のセクションコメントを使う。
- **絵文字**: ユーザーから明示要求がない限り、コード・ドキュメントとも使わない。

## 機能拡張の典型パターン

原則として **`src/data/` を起点に** してください。データ追加だけで完結するものがほとんどです。

| 追加したいもの | 主な変更箇所 |
|---|---|
| 新しい物質 | `chemicals.ts`。`kind` (原料/製品/廃棄物)、`phase` (煙突か廃棄場かを決める)、`marketSize`、`pollution` を設定 |
| 新しい装置・製法 | `devices.ts`。解禁条件は `tech`。対応する技術を `techs.ts` に追加 |
| 新しい技術効果 | `techs.ts` の `TechEffect` と `state.ts` の `getMods`、効果を使う計算箇所 |
| 新しい時代 | `eras.ts` に追加 (相場・市場規模の倍率、規制、目標)。技術の `era` を合わせる |
| 新しい固定イベント | `data/events.ts` の `SCRIPTED_EVENTS` と `sim/events.ts` の `applyScripted` |

数値を変えたら `npm test` の通しプレイ出力 (規制前後の平均損益など) で採算を確認してください。第2・第3時代には通しプレイのテストがまだないので、追加する場合は `tests/helpers.ts` に定石レイアウトを足します。

## 作業時のチェックリスト

- [ ] `npm test` と `npm run build` が通る
- [ ] `npm run dev` で開き、Console にエラーが出ていない
- [ ] 配置・配管・期の進行・契約・研究・再読み込みの復元が動く
- [ ] 日本語表示テキストの誤字・揺れがない
- [ ] `GameState` を変えたなら `SAVE_VERSION` を上げた
