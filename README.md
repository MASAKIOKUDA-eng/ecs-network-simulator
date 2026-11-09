# ecs-network-simulator

[aws-ecs-nw-mode-handson](https://github.com/MASAKIOKUDA-eng/aws-ecs-nw-mode-handson)（Amazon ECS ネットワークモード比較ハンズオン）の内容を、ブラウザで遊びながら学ぶシミュレーションゲームです。
ハンズオンの構成と実測値（2026-11-09、us-east-1）をもとにしているので、AWS アカウントがなくても遊べます。

## 遊べる画面

| 画面 | 学べること |
|------|------------|
| **配置シミュレーター** | c6i.large に何タスク置けるか。ENI（B1）・ポート（D）・メモリ（B2 / C）のどれが上限になるか。保留理由（`RESOURCE:ENI` / `RESOURCE:PORTS`）、必要台数、月額、VPC の IP 消費。起動時間のレース |
| **通信経路をたどる** | 負荷生成 EC2 → 内部 ALB → SG → ENI / docker0 / ホスト → コンテナを 1 歩ずつ。コンテナから IMDS・ECS エージェント・sshd に届くか、Flow Logs や Service Connect が使えるか |
| **障害対応クイズ** | ENI 不足（F-3）、ポート衝突（F-2）、SG 削除（F-1）など、ハンズオンで実際に起きたことから 12 問 |
| **モード診断** | レポートの「選び方」フローチャートを質問形式でたどり、結果をシミュレーターで試す |

計算方法はハンズオンの `scripts/cost-calc.py` と同じで、`test/sim.test.ts` でレポートの数値と一致することを確かめています。

## 構成

```
ブラウザ ──HTTPS──▶ CloudFront ──OAC（署名付き）──▶ S3（非公開）
                    │ セキュリティヘッダー（CSP など）を付与
                    │ HTTP は HTTPS へリダイレクト
                    ▼
              静的ファイル（HTML / CSS / JS のみ。ビルド不要・外部 CDN なし）
```

| ディレクトリ | 内容 |
|--------------|------|
| `site/` | ゲーム本体（静的サイト）。`assets/sim.js` が計算、`assets/data.js` が文章と実測値 |
| `lib/site-stack.ts` | S3 + CloudFront + BucketDeployment の CDK スタック |
| `lib/nag.ts` | cdk-nag で受け入れている指摘とその理由 |
| `config/security-headers.json` | CSP などのヘッダー（CloudFront とローカルサーバーで共通） |
| `test/` | 計算・インフラ・サイトのテスト |
| `scripts/` | ローカルサーバー、アクセシビリティ検査 |

## コスト

常時動くもの（EC2、NAT、ALB、WAF など）は作りません。サイトは約 100 KB です。

| リソース | 料金の目安 |
|----------|------------|
| CloudFront | 常時無料枠（毎月 1 TB の転送・1,000 万リクエスト）に収まる想定。`PriceClass_100`（北米・欧州のエッジ）で単価も最安 |
| S3 | 保存量が 1 MB 未満のため月 $0.01 未満 |
| BucketDeployment の Lambda | デプロイ時に数秒動くだけ。ログは 7 日で削除 |
| CloudFront の無効化 | デプロイごとに `/*` の 1 パス（月 1,000 パスまで無料） |

学習用の使い捨て環境として、`cdkd destroy` でバケットの中身ごと削除できる設定にしています。

## セキュリティ

- **S3**：パブリックアクセスをすべてブロックし、CloudFront の OAC（このディストリビューションの ARN に限定）からだけ読めます。SSE-S3 で暗号化し、TLS 1.2 未満と HTTP を拒否。ACL は無効（BucketOwnerEnforced）
- **CloudFront**：HTTP は HTTPS へリダイレクトし、許可するメソッドは GET / HEAD だけ。存在しないパスは 404 ページを返します
- **セキュリティヘッダー**：
  - `Content-Security-Policy`：`default-src 'none'` を起点に自サイトのスクリプトとスタイルだけを許可。`unsafe-inline` / `unsafe-eval` はなし。`require-trusted-types-for 'script'` で、innerHTML などの文字列を HTML として扱う API をブラウザ側でも禁止
  - `Strict-Transport-Security`（2 年、サブドメインを含む）、`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Permissions-Policy`（カメラ・マイク・位置情報などを無効化）、`Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy: same-origin`
- **フロントエンド**：DOM は `createElement` と `textContent` だけで組み立てます。外部スクリプト・フォント・通信（fetch など）はなく、Cookie も使いません。保存するのはクイズの最高点だけ（このブラウザの localStorage）。これらは `test/site.test.ts` で検査しています
- **cdk-nag（AwsSolutions）**：synth のたびに検査し、違反があると synth / deploy が止まります。受け入れている指摘は `lib/nag.ts` に理由とともに記載しています
  - S3 / CloudFront のアクセスログなし、WAF なし：個人情報や入力フォームのない静的サイトで、コストを最小にするため
  - 最低 TLS バージョン：CloudFront の既定ドメイン（`*.cloudfront.net`）では指定できないため。独自ドメインと ACM 証明書を使う場合は `minimumProtocolVersion: TLS_V1_2_2021` を指定してください
  - BucketDeployment が作る IAM ポリシーのワイルドカード：CDK が生成するもので、対象はアセット用バケットとサイト用バケット、CloudFront の無効化に限られます

### 依存パッケージの既知の注意

`npm audit` で moderate が 6 件表示されます（2026-11-09 時点）。原因は aws-cdk-lib に同梱された `minimatch` の DoS の指摘（GHSA-g3hv-75wg-m249）で、同梱物のため利用側では差し替えられません。開発者の手元で自分のファイルパターンを処理するときだけ使われ、公開するサイトには含まれません。aws-cdk-lib の更新で解消されたら追従してください。

## デプロイ（cdkd）

[cdkd](https://cdkd.dev)（CDK Direct）は、CloudFormation を使わずに AWS SDK で直接デプロイする CDK 互換の CLI です。cdkd 自身が「開発・検証向け」としているため、**検証用の AWS アカウント** で使ってください。

### 前提

- Node.js 22.12 以上
- AWS の認証情報（長期のアクセスキーではなく、IAM Identity Center（`aws sso login`）や CloudShell の一時的な認証情報を推奨）

### 手順

```bash
npm ci
```

```bash
# アカウント・リージョンごとに 1 回だけ（cdkd の状態とアセットを置く S3 バケットなどを作る）
npx cdkd bootstrap
```

```bash
# 差分の確認
npx cdkd diff
```

```bash
# デプロイ。出力の SiteUrl を開くとゲームが表示される
npx cdkd deploy
```

```bash
# 片付け（バケットの中身ごと削除）
npx cdkd destroy
```

- リージョンは `CDK_DEFAULT_REGION`（未設定なら `us-east-1`）です。変える場合は `AWS_REGION` などで指定してください
- 本番運用で CloudFormation の管理下に置きたい場合は、同じアプリを `npx cdk bootstrap` → `npx cdk deploy` でもデプロイできます

### ログや独自ドメインを付けたいとき

- アクセスログ：`Distribution` の `enableLogging: true` と、S3 の `serverAccessLogsBucket` を設定します（ログの保存と転送の料金がかかります）
- 独自ドメイン：ACM 証明書（us-east-1）を `certificate` と `domainNames` に指定し、`minimumProtocolVersion` を `TLS_V1_2_2021` にします

## ローカルで遊ぶ・開発する

```bash
npm ci
```

```bash
# http://127.0.0.1:8080/ で確認（CloudFront と同じ CSP などのヘッダーを付ける）
npm run serve
```

| コマンド | 内容 |
|----------|------|
| `npm test` | 計算（レポートの数値との一致）、CDK のテンプレート、サイトの安全性のテスト |
| `npm run typecheck` | TypeScript の型検査 |
| `npm run synth` | cdk-nag の検査を含めて CloudFormation テンプレートを生成 |
| `npm run check:a11y` | 全画面を Chromium で開き、axe-core（WCAG 2.2 AA）・CSP 違反・JS エラーを検査。Playwright が必要（`npm i -D playwright && npx playwright install chromium`） |

数値や問題を変えるときは `site/assets/data.js`（文章・実測値）と `site/assets/sim.js`（単価・計算）を編集し、`npm test` を実行してください。

## アクセシビリティ

WCAG 2.2 AA を目標にしています。

- 見出し・ランドマーク・リスト・表など、意味に合った HTML を使用。`lang="ja"`、「本文へスキップ」リンクあり
- すべての操作をキーボードだけでできます。フォーカスは常に見え（3px の枠）、画面を切り替えると見出しにフォーカスが移り、ページのタイトルも変わります
- クリックできる部分は 44px 以上
- 図（SVG）には内容を文章にした説明を付け、同じ情報を表でも提供しています。月額のグラフは表と同じ内容なので、支援技術からは表を読んでもらいます
- 色だけに頼りません。パターンは色と ID（A / B1 / B2 / C / D）を必ず並べ、正解・不正解や「届く・届かない」には記号（✓ / ✗ / ⚠）と文字を付けています。使えない枠は斜線の模様で示します
- 配置の結果・経路の現在地・レースの結果は、スクリーンリーダーに読み上げます（スライダーを動かしている間は、止まってからまとめて読み上げ）
- クイズで未選択のまま回答するとエラーを表示し、最初の選択肢にフォーカスを戻します。回答後は結果の見出しにフォーカスを移し、続けて解説を読めます
- 文字と背景のコントラストは 4.5:1 以上、図の部品の境界は 3:1 以上。パターンの色は、色覚の多様性を考慮して検証した配色です
- ダークモード、動きを減らす設定（レースのアニメーションを省略）、強制カラーモード（Windows のハイコントラスト）、印刷に対応
- 幅 320px の画面でも横スクロールなしで使えます（広い表は表の中だけでスクロール）

## 出典とライセンス

- 内容：[aws-ecs-nw-mode-handson](https://github.com/MASAKIOKUDA-eng/aws-ecs-nw-mode-handson) の `docs/handson-guide.md` と `docs/reports.md`
- 料金とサービス仕様は変わります。実際の設計では公式ドキュメントで最新の値を確認してください
- ライセンス：Apache License 2.0
