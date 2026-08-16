# DOPA BREAK

**60秒。壊せるだけ壊せ。**

超短時間・大量破壊・ローグライト・スコアアタック。
ビルド不要・依存ゼロのブラウザゲーム（Vanilla JS + Canvas2D + WebAudio）。

---

## 遊ぶ

### 1. 単一ファイルをそのまま開く（一番手軽）

`dist/dopa-break.html` をダウンロードしてダブルクリックするだけ。
サーバ不要・`file://` で動きます（HTML/CSS/JS を1ファイルに畳んであるため）。

### 2. 開発用サーバで開く

`src/` の ES Modules をそのまま読むため、こちらは**ローカルサーバ経由**が必要です
（`file://` だと CORS でモジュールが読めません）。

```bash
python3 -m http.server 8080     # or: npm start
```

ブラウザで `http://localhost:8080/` を開く。
スマホ実機で試す場合は同じ Wi-Fi 内から `http://<PCのIP>:8080/`。

### 単一ファイルのビルド

```bash
npm run build      # -> dist/dopa-break.html
```

`build.mjs` が `src/` の各モジュールを依存順に連結し、CSS とともに1つの HTML へ埋め込みます。
連結後は1スコープになるため、トップレベル名が衝突した場合はビルドが**エラーで停止**します
（気付かないうちに上書きされるのを防ぐため）。依存パッケージはありません。

## 操作方法

**指1本だけ。**

| 操作 | 挙動 |
|---|---|
| タップ | その場所で爆発（触れた瞬間に1発出る） |
| 押しっぱなし | 連射しつづける |
| 指を動かす | 爆心地が指について動く |
| レベルアップ | カード3枚から1枚をタップ |
| 結果画面 | RETRY を1タップで次のゲーム |

PC はマウスで同じ操作（クリック＝タップ、ドラッグ＝ホールド）。

---

## ゲームデザイン

### Core Loop（1周 5〜12秒）

```
指を置く → 爆発 → 敵が砕ける → 数字/SE/振動 → コンボ上昇
  → EXP → LEVEL UP → 3択カード → 目に見えて強くなる
  → コンボ倍率が伸びる → FEVER / イベント → 大量報酬 → さらに壊れる
```

### 体験曲線

| 時間 | 起きること |
|---|---|
| 0–3秒 | タイトルで指アイコンが脈打つ。**どこを触ってもその場で開始＆1発目が爆発**。開幕から9体が指の届く距離にいる |
| 3–10秒 | 破壊 → 白い閃光・破片・ヒットストップ・数字ポップ・上昇音程。約5秒で初回 LEVEL UP |
| 10–30秒 | LV3〜5。連射速度と爆発範囲が体感で変わる。コンボ x3〜x5。最初のランダムイベント（3秒前に予告） |
| 30–60秒 | EPIC 級のシナジーが噛み合い連鎖爆発が始まる。FEVER 自動発動。BOSS 撃破で TIME+10 |
| 60秒〜 | LEGENDARY が絡むと画面全域が連鎖崩壊。コンボ x50〜x100 |

### 報酬の強弱

小（1体破壊の閃光）→ 中（コンボ段位・クリティカル）→ 大（LEVEL UP・FEVER）→ 予想外（LEGENDARY・BOSS の JACKPOT）。

**常に画面上に「あと少しで何かが起きる」が1つ以上ある**ように、
EXPバー／FEVERゲージ／イベント予告カウントダウンを同時に配置している。

### コンボ

```
x1 → NICE x2(5) → GREAT x3(15) → EXCELLENT x5(30) → INSANE x10(60)
   → GODLIKE x20(100) → UNREAL x50(200) → DOPAMINE x100(400)
```

段位が上がるごとに SE の音程・パーティクル量・画面ズーム・フラッシュが強化される。
**コンボが切れても罰はない**（表示だけ出して倍率が戻る）。
敵が CORE に当たった時もコンボは全損せず 60% 残る。

### シナジー（壊れたビルドを狙って作れる）

- `CHAIN` + `DETONATOR` + `APOCALYPSE` → 撃破が必ず爆発し、その爆発が連鎖する
- `MULTI BLAST` + `WIDE SPREAD` + `BULLET HELL` → 1タップで画面が埋まる
- `BLACK HOLE` + `SINGULARITY` + `BIG BLAST` → 敵を1点に集めて一掃
- `MIDAS` + `GOLDEN GOD` + `GREED` → コインが弾幕になりスコアにも化ける
- `LIGHTNING` + `THUNDER GOD` → 3コンボごとに落雷5本

### メタ進行

コイン → 永続強化4種（POWER CORE / LUCK / HEAD START / GREED）。
localStorage 保存。結果画面にそのまま並ぶので、メニューを掘る必要がない。

---

## ファイル構成

```
index.html          エントリ（HUD と各オーバーレイの DOM）
build.mjs           単一HTMLへのバンドル（依存ゼロ）
dist/dopa-break.html  ビルド成果物。これ単体で遊べる
css/style.css       HUD・カード・リザルト（safe-area / 片手操作前提）
src/main.js         起動・キャンバス・入力・メインループ
src/config.js       全チューニング値（バランスはここだけ触れば済む）
src/rng.js          乱数・重み付き抽選
src/audio.js        WebAudio 合成SE（音声素材ゼロ。コンボで音程が上がる）
src/fx.js           Juice層（粒子/振動/ヒットストップ/スロー/文字/リング/雷/ズーム）
src/entities.js     敵・コイン
src/upgrades.js     強化カード36種＋レアリティ抽選
src/events.js       ランダムイベント＋3秒前予告
src/meta.js         localStorage（ベスト記録・永続強化）
src/ui.js           HUD更新・カード表示・リザルト・ショップ
src/game.js         ゲーム世界とステートマシン
```

外部素材は一切使用していない（画像・音声・フォント・ライブラリすべてゼロ）。

---

## 対応環境

iPhone Safari を最優先。`viewport-fit=cover` + `env(safe-area-inset-*)`、
`touch-action:none`、ダブルタップズーム抑止、Web Audio の初回ジェスチャ解錠、
`navigator.vibrate`（対応端末のみ）に対応。
DPR は 2 で頭打ちにして描画負荷を抑えている。
