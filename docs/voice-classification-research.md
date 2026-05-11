# voice-like / object-like 分類 調査メモ

Issue: #4  
調査日: 2026-05-11

---

## 結論（先に書く）

### 今やる / 後回し の判断

**後回し。MVP（異変検知）が安定してから着手する。**

### 推奨アプローチ（着手するなら）

**ルールベース 3特徴量の組み合わせ**でまず試す。

| 特徴量 | 計算コスト | 効き |
|---|---|---|
| ゼロ交差率（ZCR） | 低 | 声 vs 衝撃音の一次スクリーニング |
| スペクトル重心 | 低 | 広帯域ノイズ vs 帯域集中の判別 |
| 低域エネルギー比 | 低 | 声の基本周波数帯（100–400 Hz）の存在確認 |

この3つを AnalyserNode だけで実装でき、推論コストはフレームあたり数十マイクロ秒（ほぼ無視できる）。  
精度は環境依存で 60–75% 程度と見積もる（**要実測**）。十分な精度が出ない場合は ML 路線を検討する。

---

## ルールベース（Web Audio API）

### AnalyserNode で取得できるデータ

```
AnalyserNode.getFloatTimeDomainData(buffer)  // 時系列波形 PCM float32
AnalyserNode.getFloatFrequencyData(buffer)   // 対数スペクトル (dBFS)
```

`fftSize` は 2048 推奨（周波数分解能 ~21 Hz @ 44100 Hz、更新レート ~21 ms）。  
`smoothingTimeConstant = 0` で瞬時スペクトルを取る（分類用）。

### 特徴量の実装可否と計算コスト

#### 1. ゼロ交差率（ZCR）

```typescript
function calcZCR(buf: Float32Array): number {
  let count = 0;
  for (let i = 1; i < buf.length; i++) {
    if ((buf[i] >= 0) !== (buf[i - 1] >= 0)) count++;
  }
  return count / buf.length;
}
```

- **実装**: 可。`getFloatTimeDomainData` の結果を走査するだけ
- **コスト**: O(N)、N=2048 で ~2–5μs
- **解釈**:
  - 声（100–300 Hz 基音主体）: ZCR 低め（0.01–0.04 程度）
  - 衝撃音・金属音（高周波豊富）: ZCR 高め（0.1 以上）
  - ホワイトノイズ: 非常に高い（0.4 超）
- **注意**: 低い ZCR だけでは「声 or 低音物音」の区別が不完全。補助特徴量が必要

#### 2. スペクトル重心（Spectral Centroid）

```typescript
function calcCentroid(freqData: Float32Array, sampleRate: number): number {
  const binHz = sampleRate / (freqData.length * 2);
  let weightedSum = 0, totalPower = 0;
  for (let i = 0; i < freqData.length; i++) {
    const power = Math.pow(10, freqData[i] / 10); // dBFS → linear power
    weightedSum += i * binHz * power;
    totalPower += power;
  }
  return totalPower > 0 ? weightedSum / totalPower : 0;
}
```

- **実装**: 可。`getFloatFrequencyData` の結果から計算
- **コスト**: O(N/2)、~5–10μs
- **解釈**:
  - 成人男声: 重心 1,000–2,000 Hz
  - 成人女声: 重心 2,000–3,500 Hz
  - 金属衝撃・破砕音: 重心 4,000 Hz 以上
  - 低周波ドア音・足音: 重心 200–800 Hz（声と混在域）
- **注意**: 重心だけでは低周波物音 vs 声が重なる。帯域別エネルギーと組み合わせる

#### 3. 基本周波数（F0）の有無

周期性の検出は Autocorrelation（自己相関）で実装可能：

```typescript
function estimateF0(buf: Float32Array, sampleRate: number): number | null {
  // YIN 法の簡易版: 差分関数 d(τ) = Σ (x[n] - x[n+τ])^2 を計算
  const minPeriod = Math.floor(sampleRate / 400); // 400 Hz上限
  const maxPeriod = Math.floor(sampleRate / 80);  // 80 Hz下限
  let minD = Infinity, bestTau = -1;
  for (let tau = minPeriod; tau <= maxPeriod; tau++) {
    let d = 0;
    for (let n = 0; n < buf.length - tau; n++) {
      const diff = buf[n] - buf[n + tau];
      d += diff * diff;
    }
    if (d < minD) { minD = d; bestTau = tau; }
  }
  // minD が十分小さければ周期性あり
  const threshold = 0.1; // 要調整
  return minD < threshold ? sampleRate / bestTau : null;
}
```

- **実装**: 可だが計算量が増える
- **コスト**: O(N × (maxPeriod - minPeriod)) ≈ O(2048 × 470) ≈ **要実測**。最適化（FFT-based correlation）があれば O(N log N)
- **解釈**: F0 が 80–400 Hz に検出されれば voice-like の強い根拠
- **注意**: 環境ノイズが乗ると F0 検出精度が落ちる。ZCR + 重心のスクリーニング後に限定適用するのが現実的

#### 4. 低域エネルギー比

```typescript
function calcLowFreqRatio(freqData: Float32Array, sampleRate: number): number {
  const binHz = sampleRate / (freqData.length * 2);
  const boundary = Math.floor(500 / binHz); // 500 Hz 境界
  let low = 0, total = 0;
  for (let i = 1; i < freqData.length; i++) {
    const power = Math.pow(10, freqData[i] / 10);
    if (i < boundary) low += power;
    total += power;
  }
  return total > 0 ? low / total : 0;
}
```

- **実装**: 可。O(N/2)
- **解釈**: 声は 100–3000 Hz に集中するため、低域比率が高め（0.3–0.6）。衝撃音は広帯域

#### 5. アタック時間

```typescript
// 直前フレームとの比較でエネルギー急峻度を計算
const rise = currentRMS / previousRMS;
const isImpulse = rise > 5.0; // 閾値は要調整
```

- **実装**: 可。O(N)
- **解釈**: 衝撃音はアタック < 10ms、声は緩やか（50ms 以上）
- **注意**: MVP の「異変検知」がすでに急峻な立ち上がりを検知しているので流用可能

### 分類ロジックの設計案

```
ZCR < 0.04 かつ 重心 < 3500 Hz かつ 低域比 > 0.25
  → F0 検出を試みる
  → F0 あり: voice-like
  → F0 なし: unknown（低音物音の可能性）

ZCR > 0.08 または 重心 > 4000 Hz
  → object-like（衝撃・金属系）

それ以外
  → unknown
```

### 計算コスト見積もり（1フレーム）

| 処理 | コスト |
|---|---|
| getFloatTimeDomainData + ZCR | ~5μs |
| getFloatFrequencyData + 重心 + 低域比 | ~10μs |
| F0 推定（簡易版） | ~30–100μs（要実測） |
| 合計 | ~50–120μs / フレーム |

10ms ごとに処理しても CPU 占有率は 0.5–1.2%（**要実測**）。常時動作に現実的な範囲。

---

## 軽量 ML（ブラウザ）

### Web Speech API

- **用途**: 音声→テキスト変換 API
- **voice detection への流用可否**: 設計上は可（音声が届いたらコールバックが発火）
- **問題**:
  - 常時認識モードは「発話のたびにネットワーク送信」が前提の実装が多い（Chrome の場合、オフライン時は精度が落ちる）
  - 検知のためだけに使うのはオーバーキル
  - on-device 完結を保証できない（実装依存）
  - **プライバシー説明が難しい**: 「音声認識 API を使っている」= 内容を聞いていると誤解されやすい
- **結論**: voice detection の用途には不適。採用しない

### TensorFlow.js + YAMNet

- **概要**: Google が学習した音響イベント分類モデル（521 クラス）
- **ブラウザ動作**: 可。`@tensorflow/tfjs` + `@tensorflow-models/speech-commands` または生 TFLite モデルをロード
- **モデルサイズ**: YAMNet 本体は ~3.7MB（tfjs 形式）
- **推論時間**: 0.96 秒の音声クリップを処理するのに **要実測**。GPU バックエンド使用で 5–15ms / 推論の報告が多い（Chrome DevTools + WebGL バックエンド前提）。Tauri の WebView = Chromium なので条件は同等
- **メモリ**: ロード後 ~50–80MB 程度（tfjs ランタイム込み）
- **精度**: 521 クラスのうち「Speech」「Male speech」「Female speech」等の区別が可能。`voice-like` vs `object-like` への集約は出力クラスのグルーピングで実現できる
- **問題**:
  - 初期ロード時間（初回モデルダウンロード 数秒 + WebGL 初期化）
  - 50–80MB のメモリ常駐は常時動作アプリとして重い
  - 0.96 秒フレームが前提のアーキテクチャ（リアルタイム性は AudioWorklet で工夫が必要）
- **結論**: 精度は高いが、常時動作の軽量インジケータとして採用するには重い。Phase 2 以降の「精度重視モード」として検討可

### ONNX Runtime Web

- **概要**: ブラウザで ONNX モデルを推論する公式ランタイム
- **モデル持ち込み**: カスタム 2 クラス分類モデル（音声 vs 物音）を Python で学習 → ONNX エクスポート → ブラウザで推論が現実的
- **推論時間**: 小モデル（MLP 5層程度）なら < 1ms / フレーム
- **メモリ**: モデルが小さければ 10–20MB 以内
- **問題**:
  - モデルを作る必要がある（学習データ収集が最大の工数）
  - 良質な「voice」「object-hit」「ambient」ラベル付き音声データが必要
- **結論**: ルールベースが破綻したら次に検討するパス

### MediaRecorder + AudioWorklet

- **用途**: より細かいバッファ制御が必要な場合
- **AudioWorklet**: Web Audio グラフの外でリアルタイム DSP 処理をワーカースレッドで実行
- **MediaRecorder**: 音声クリップをブラウザ側でバッファし、Blob として ML モデルに投げる設計に使える
- **aero での位置づけ**: MVP ではすでに AnalyserNode ポーリングで十分。F0 推定が重い場合に AudioWorklet への移行を検討する

---

## プライバシー・説明容易性

### 「声かどうか判定するが内容は聞かない」の説明可能性

**説明しやすい**。以下の言い方が有効：

> 「声っぽい音かどうかを判定しますが、言葉の内容は一切認識しません。  
> 音の高さ・周波数パターンを数値で見ているだけで、テキストに変換する処理はありません。」

ルールベース（ZCR / 重心 / 低域比）は「音の物理量だけ」を見る。  
文字起こし・話者認識・音声録音のどれも行わない。

### 個人識別との線引き

| 処理 | 個人識別になるか | aero の方針 |
|---|---|---|
| 音量レベル検知 | No | ✅ MVP で実施 |
| ZCR / 重心計算 | No | ✅ voice分類で実施 |
| F0 推定（80–400 Hz） | **声域として識別可能だが個人特定は不可** | ✅ 許容範囲 |
| 話者認識（声紋）| Yes | ❌ 実装しない |
| 音声テキスト化 | 内容把握に該当 | ❌ 実装しない |

F0（基本周波数）は「その人が話しているかどうか」ではなく「声帯振動があるか」を見るだけ。  
個人特定には声紋（MFCC + 時系列比較等）が必要で、aero の構成ではそこまで踏み込まない。

### on-device 完結

**完全に on-device で完結できる**。

- AnalyserNode / AudioWorklet は全てブラウザ内処理
- Web Audio API はサンプルをネットワーク送信しない
- YAMNet を使う場合も推論はブラウザ内（モデルのダウンロード時は通信が発生するが、推論は local）
- Tauri の環境（WebView + Rust native）は追加の外部通信を持たない

プライバシーポリシーへの記載例：  
> 「マイクで取得した音は端末内のみで処理されます。音声データの録音・送信・保存は行いません。」

---

## 実装コスト見積もり

### ルールベース 3特徴量（ZCR + 重心 + 低域比）

| フェーズ | 内容 | 工数目安 |
|---|---|---|
| 実装 | TypeScript で3特徴量計算 + 分類ロジック | 1–2日 |
| 閾値チューニング | 実環境でサンプル収集 + 手動調整 | 1–3日 |
| UI統合 | voice-like アイコン表示 | 0.5日 |
| 合計 | | **3–6日** |

精度保証なし。環境によっては誤分類が多発する可能性あり。

### F0 推定追加

| フェーズ | 内容 | 工数目安 |
|---|---|---|
| 実装（簡易 YIN） | TypeScript | 1日 |
| 性能チューニング | AudioWorklet 移行判断含む | 1日 |
| 合計追加分 | | **+2日** |

### TensorFlow.js + YAMNet

| フェーズ | 内容 | 工数目安 |
|---|---|---|
| 統合 | tfjs + YAMNet ロード + 推論パイプライン | 2–3日 |
| バッファリング設計 | 0.96秒フレームのリアルタイム化 | 1–2日 |
| メモリ最適化 | 常時50–80MB は許容か判断 | 1日 |
| 合計 | | **4–6日** |

---

## 判断まとめ

```
MVP（異変検知）が先。Phase 2 で voice/object 分類を検討。

Phase 2 着手時の推奨順序:

Step 1: ZCR + 重心 + 低域比 の 3特徴量ルールベース
  → 実装 3–6日、精度は環境依存（要実測）
  → 「声っぽい」「衝撃音っぽい」の粗い区別には十分な可能性あり

Step 2: 精度が不満なら F0 推定を追加
  → AudioWorklet で重い処理をオフロード

Step 3: それでも不満なら YAMNet or カスタム ONNX モデル
  → 工数・メモリコストが跳ね上がるため慎重に判断

プライバシー観点では全ステップでオンデバイス完結が可能。
「声の内容は認識しない」の説明もルールベースなら特に容易。
```

### 分類精度の現実的な上限（推定）

| 条件 | ルールベース精度 | YAMNet 精度 |
|---|---|---|
| 静かな室内、明瞭な人声 | ~80% | ~90% |
| 生活騒音あり（TV等） | ~60% | ~80% |
| 建設音・大音量環境 | ~40% | ~65% |

※ 上記は文献値・実績値からの推算。**実環境での実測必須**。

---

_このメモは Issue #4 の受け入れ条件「today やる / 後回しの判断材料」を満たすために作成した。_  
_実装開始時は Step 1 から着手し、実測値を本ファイルに追記していく。_
