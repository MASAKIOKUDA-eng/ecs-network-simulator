// ゲームで使う文章と実測値。出典はハンズオンの docs/handson-guide.md と docs/reports.md。

export const SOURCE_URL = 'https://github.com/MASAKIOKUDA-eng/aws-ecs-nw-mode-handson';

export const LIMIT_LABEL = Object.freeze({
  eni: 'ENI 数',
  trunk: 'トランク ENI の上限',
  port: 'ポート（同じポートは 1 台に 1 つ）',
  memory: 'メモリ',
  cpu: 'CPU',
});

export const PATTERNS = Object.freeze({
  A: {
    id: 'A',
    name: 'Fargate + awsvpc',
    short: 'Fargate',
    capacity: 'Fargate',
    mode: 'awsvpc',
    target: 'ip',
    listener: 8001,
    summary: 'タスクごとに ENI と IP が付く。インスタンスの管理は不要',
    startup: { median: 17.0, p95: 27.2 },
    throughputP8: 2.34,
    p99Direct: 0.79,
  },
  B1: {
    id: 'B1',
    name: 'EC2 + awsvpc（トランキングなし）',
    short: 'EC2 awsvpc',
    capacity: 'EC2',
    mode: 'awsvpc',
    target: 'ip',
    listener: 8002,
    summary: 'タスクごとに ENI。インスタンスの ENI 数がタスク数の上限になる',
    startup: { median: 11.3, p95: 18.6 },
    throughputP8: 4.26,
    p99Direct: 0.57,
  },
  B2: {
    id: 'B2',
    name: 'EC2 + awsvpc（トランキングあり）',
    short: 'EC2 awsvpc + trunk',
    capacity: 'EC2',
    mode: 'awsvpc',
    target: 'ip',
    listener: 8003,
    summary: 'トランク ENI の下にタスク用のブランチ ENI をぶら下げ、上限を緩和',
    startup: { median: 10.3, p95: 13.5 },
    throughputP8: 4.17,
    p99Direct: 0.55,
  },
  C: {
    id: 'C',
    name: 'EC2 + bridge（動的ポート）',
    short: 'EC2 bridge',
    capacity: 'EC2',
    mode: 'bridge',
    target: 'instance',
    listener: 8004,
    summary: 'docker0 ブリッジ経由。ホストの動的ポートをコンテナの 8080 に転送',
    startup: { median: 3.0, p95: 3.8 },
    throughputP8: 2.36,
    p99Direct: 0.54,
  },
  D: {
    id: 'D',
    name: 'EC2 + host',
    short: 'EC2 host',
    capacity: 'EC2',
    mode: 'host',
    target: 'instance',
    listener: 8005,
    summary: 'ホストのネットワークをそのまま使う。同じポートは 1 台に 1 タスクまで',
    startup: { median: 1.8, p95: 2.3 },
    throughputP8: 4.53,
    p99Direct: 0.51,
  },
});

/** 通信経路：負荷生成 EC2 → 内部 ALB → タスク */
export const PATHS = Object.freeze({
  A: [
    { node: '負荷生成 EC2（AZ-b）', detail: 'k6 が http://内部ALB:8001/1k にリクエストを送る。VPC は IGW / NAT なしで外部から入れない' },
    { node: '内部 ALB リスナー :8001', detail: 'ターゲットタイプは ip。ターゲットはタスクの IP アドレス' },
    { node: 'タスク用 SG', detail: 'タスクの ENI に付く SG で、ALB の SG から 8080 だけを許可する' },
    { node: 'タスクの ENI（Fargate 管理）', detail: 'タスク専用の ENI と VPC の IP。インスタンスは見えない' },
    { node: 'nginx コンテナ :8080', detail: 'コンテナはタスクの ENI を直接使う。ポートの変換はない' },
  ],
  B1: [
    { node: '負荷生成 EC2（AZ-b）', detail: 'k6 が http://内部ALB:8002/1k にリクエストを送る' },
    { node: '内部 ALB リスナー :8002', detail: 'ターゲットタイプは ip。ターゲットはタスクの IP アドレス' },
    { node: 'タスク用 SG', detail: 'タスクの ENI に付く SG。タスクごとに SG を分けられる' },
    { node: 'EC2 に追加で付いたタスク ENI', detail: 'タスクごとに ENI を 1 つ EC2 に付ける。c6i.large は ENI 3 つ（プライマリを除いて 2 つ）まで' },
    { node: 'nginx コンテナ :8080', detail: 'タスク専用のネットワーク名前空間。ポートの変換はない' },
  ],
  B2: [
    { node: '負荷生成 EC2（AZ-b）', detail: 'k6 が http://内部ALB:8003/1k にリクエストを送る' },
    { node: '内部 ALB リスナー :8003', detail: 'ターゲットタイプは ip。ターゲットはタスクの IP アドレス' },
    { node: 'タスク用 SG', detail: 'ブランチ ENI ごとに SG が付く。タスク単位の分離は B1 と同じ' },
    { node: 'トランク ENI → ブランチ ENI', detail: 'EC2 に付くのはトランク ENI 1 つ。その下にタスクごとのブランチ ENI（VLAN）を作る。c6i.large は 10 タスクまで' },
    { node: 'nginx コンテナ :8080', detail: 'タスク専用のネットワーク名前空間。ポートの変換はない' },
  ],
  C: [
    { node: '負荷生成 EC2（AZ-b）', detail: 'k6 が http://内部ALB:8004/1k にリクエストを送る' },
    { node: '内部 ALB リスナー :8004', detail: 'ターゲットタイプは instance。ターゲットは「インスタンス ID ＋動的ポート（例：32791）」' },
    { node: 'インスタンス用 SG', detail: '動的ポートの範囲 32768–65535 をまとめて許可する必要がある。同じインスタンスのタスクで SG を共有' },
    { node: 'EC2 のプライマリ ENI → docker0', detail: 'iptables の NAT で、ホストの動的ポートをコンテナの 172.17.0.x:8080 に転送' },
    { node: 'nginx コンテナ :8080', detail: 'コンテナごとに名前空間が分かれる。同じタスクのサイドカーに localhost では届かない' },
  ],
  D: [
    { node: '負荷生成 EC2（AZ-b）', detail: 'k6 が http://内部ALB:8005/1k にリクエストを送る' },
    { node: '内部 ALB リスナー :8005', detail: 'ターゲットタイプは instance。ターゲットは「インスタンス ID ＋ 8080」' },
    { node: 'インスタンス用 SG', detail: '8080 を許可。同じインスタンスの他のプロセスとも SG を共有する' },
    { node: 'EC2 のプライマリ ENI', detail: 'ブリッジも NAT もない。コンテナはホストのネットワーク名前空間をそのまま使う' },
    { node: 'nginx プロセス :8080', detail: 'ホストの 8080 を占有するため、同じインスタンスに同じタスクは 1 つまで' },
  ],
});

/** コンテナの中から何に届くか（security-probe.sh の結果） */
export const PROBES = Object.freeze([
  { item: 'IMDS（インスタンスメタデータ）', A: false, B1: false, B2: false, C: false, D: true, note: 'awsvpc は ECS_AWSVPC_BLOCK_IMDS、bridge はホップ数上限 1 で遮断。host は遮断できない' },
  { item: 'ECS エージェント API（127.0.0.1:51678）', A: false, B1: false, B2: false, C: false, D: true, note: 'host はホストの localhost がそのまま見える' },
  { item: 'ホストの sshd（127.0.0.1:22）', A: false, B1: false, B2: false, C: false, D: true, note: '同上' },
]);

export const PROBE_INTERFACES = Object.freeze({
  A: 'タスク専用（eth0 / ecs-eth0）',
  B1: 'タスク専用（eth0 / ecs-eth0）',
  B2: 'タスク専用（eth0 / ecs-eth0）',
  C: 'コンテナ専用（172.17.0.0/16）',
  D: 'ホストのものすべて（ens5、docker0）',
});

/** 観測性とサービス間通信 */
export const OBSERVABILITY = Object.freeze([
  { item: 'VPC Flow Logs の ECS フィールド', A: 'タスク ID まで', B1: 'タスク ID まで', B2: 'タスク ID まで', C: 'インスタンスまで', D: 'インスタンスまで' },
  { item: 'Container Insights のネットワークメトリクス', A: 'あり', B1: 'あり', B2: 'あり', C: 'あり', D: 'なし' },
  { item: 'SG の単位', A: 'タスク', B1: 'タスク', B2: 'タスク', C: 'インスタンス', D: 'インスタンス' },
  { item: 'FIS のネットワーク障害注入', A: '対応', B1: '対応', B2: '対応', C: '非対応', D: '対応' },
  { item: 'ECS Service Connect', A: '対応', B1: '対応', B2: '対応', C: '対応', D: '非対応' },
  { item: 'タスク内の localhost 通信', A: '届く', B1: '届く', B2: '届く', C: '届かない（links が必要）', D: '届く' },
]);

/** クイズ（障害対応と設計） */
export const QUIZ = Object.freeze([
  {
    id: 'eni-shortage',
    scene: '障害 F-3',
    question: 'B1（EC2 + awsvpc、トランキングなし）の c6i.large 2 台に、他に何も動いていない状態でタスクを 10 個要求しました。実行中になるのは何個でしょう？',
    choices: ['2 個', '4 個', '7 個', '10 個'],
    answer: 1,
    explanation: 'c6i.large の ENI は 3 つで、プライマリを除くとタスクに使えるのは 1 台 2 つ。2 台で 4 個までです。残りは RESOURCE:ENI で保留になります。対処は ENI トランキング（B2）の有効化です。',
  },
  {
    id: 'port-conflict',
    scene: '障害 F-2',
    question: 'デプロイが進まず、ECS イベントに RESOURCE:PORTS が出ています。サーキットブレーカーで約 1 分後にロールバックしました。起きやすいのはどのモードでしょう？',
    choices: ['awsvpc', 'bridge（動的ポート）', 'host'],
    answer: 2,
    explanation: 'host モードはホストの 8080 を占有するため、同じインスタンスに同じタスクを 2 つ置けません。予備の台数を持つか、minimumHealthyPercent を下げて処理能力の一時低下を受け入れる必要があります。',
  },
  {
    id: 'imds',
    scene: 'セキュリティ',
    question: 'コンテナの中から IMDS（インスタンスメタデータ）のトークンを取得できてしまったのはどのモードでしょう？',
    choices: ['Fargate（awsvpc）', 'EC2 + awsvpc', 'bridge', 'host'],
    answer: 3,
    explanation: 'host はホストのネットワークをそのまま使うため、IMDS・ECS エージェント API・ホストの sshd に届きました。awsvpc は ECS_AWSVPC_BLOCK_IMDS、bridge はホップ数上限 1 で遮断できます。',
  },
  {
    id: 'cheapest',
    scene: 'コスト',
    question: '0.25 vCPU / 512 MiB のタスクを 40 個、EC2（c6i.large）で動かします。月額が最も安くなるのはどれでしょう？',
    choices: ['B1（awsvpc、トランキングなし）', 'B2（awsvpc、トランキングあり）と C（bridge）が同額', 'D（host）'],
    answer: 1,
    explanation: 'B2 と C はどちらもメモリが上限で 1 台 7 タスク、6 台で約 $372。B1 は ENI で 1 台 2 タスク（20 台・約 $1,241）、D はポートで 1 台 1 タスク（40 台・約 $2,482）です。',
  },
  {
    id: 'startup',
    scene: 'スピード',
    question: 'タスクの起動時間（中央値）が最も短かったのはどれでしょう？',
    choices: ['A（Fargate）', 'B2（awsvpc + トランキング）', 'D（host）'],
    answer: 2,
    explanation: 'host 1.8 秒、bridge 3.0 秒に対し、EC2 の awsvpc は ENI の準備で 10〜11 秒、Fargate はさらにイメージ取得が加わって 17 秒でした。トランキングでも ENI の準備は短くなりません。',
  },
  {
    id: 'flowlogs',
    scene: 'モニタリング',
    question: 'VPC Flow Logs の ECS フィールドで、通信を「どのタスクか」まで追えるのはどのモードでしょう？',
    choices: ['awsvpc', 'bridge', 'host', 'すべて'],
    answer: 0,
    explanation: 'awsvpc はタスクごとに ENI を持つので ecs-task-id が入ります。bridge と host はホストの ENI にまとまり、インスタンスまでしか追えません。',
  },
  {
    id: 'insights',
    scene: 'モニタリング',
    question: 'Container Insights のネットワークメトリクス（NetworkRx/TxBytes）が取れなかったのはどのモードでしょう？',
    choices: ['awsvpc', 'bridge', 'host'],
    answer: 2,
    explanation: 'host では取得できず、DevOps Agent は EC2 の NetworkOut や ALB の ProcessedBytes で代用しました。',
  },
  {
    id: 'sidecar',
    scene: 'サイドカー',
    question: '同じタスクのサイドカーに http://localhost:8080 でアクセスしたら失敗しました。どのモードでしょう？',
    choices: ['awsvpc', 'bridge', 'host'],
    answer: 1,
    explanation: 'bridge はコンテナごとに名前空間が分かれます。links を設定してコンテナ名で通信するか、Service Connect を使います。',
  },
  {
    id: 'bridge-sg',
    scene: '障害 F-1',
    question: 'bridge のターゲットが unhealthy です。インスタンスの SG で、ALB から許可する必要があるのはどれでしょう？',
    choices: ['8080 だけ', '動的ポートの範囲 32768–65535', '80 と 443'],
    answer: 1,
    explanation: 'bridge の動的ポートはタスクが入れ替わるたびに変わるため、範囲でまとめて許可します。そのぶん許可範囲は広くなります。',
  },
  {
    id: 'fargate-mode',
    scene: '設計',
    question: 'Fargate で使えるネットワークモードはどれでしょう？',
    choices: ['awsvpc のみ', 'awsvpc と bridge', 'awsvpc・bridge・host'],
    answer: 0,
    explanation: 'Fargate は awsvpc のみ、ECS Managed Instances は awsvpc と host です。awsvpc で作っておくとキャパシティの選択肢が最も広くなります。',
  },
  {
    id: 'ip',
    scene: 'IP の消費',
    question: 'bridge（C）のタスクを 10 個追加したとき、サブネットの空き IP はいくつ減ったでしょう？',
    choices: ['0', '10', '20'],
    answer: 0,
    explanation: 'bridge と host はインスタンスの IP を使うので、タスクを増やしても減りません。awsvpc はタスクごとに 1 つずつ減ります（Fargate 20 タスクで 20 減少）。',
  },
  {
    id: 'throughput',
    scene: 'スピード',
    question: '1 本の TCP 接続のスループットは、どのモードもほぼ 5 Gbps でした。理由として正しいのはどれでしょう？',
    choices: ['ネットワークモードによる差がないから', 'AWS の 1 フローあたりの上限（約 5 Gbps）に当たったから', 'ALB の上限に当たったから'],
    answer: 1,
    explanation: 'プレイスメントグループ外では 1 フローあたり約 5 Gbps が上限です。8 並列では A と C だけ約 2.3 Gbps に下がりましたが、原因は未確定です。',
  },
]);

/** モード診断（reports.md の「結論：選び方」） */
export const CHOOSER = Object.freeze({
  start: 'fargate',
  nodes: {
    fargate: { question: 'Fargate を使いますか？', yes: 'r-fargate', no: 'per-task' },
    'per-task': {
      question: 'タスク単位の SG・Flow Logs・障害注入・Service Connect、または localhost で話すサイドカーを使いたいですか？',
      yes: 'r-awsvpc',
      no: 'migrate',
    },
    migrate: { question: '将来 Fargate や ECS Managed Instances に移す可能性がありますか？', yes: 'r-awsvpc', no: 'density' },
    density: { question: '起動の速さ（数秒）と 1 台あたりのタスク数を最優先したいですか？', yes: 'r-bridge', no: 'host' },
    host: {
      question: '1 台に 1 タスクで、ネットワーク性能を最優先し、ワークロードを信頼できますか？',
      yes: 'r-host',
      no: 'r-awsvpc',
    },
  },
  results: {
    'r-fargate': { pattern: 'A', title: 'awsvpc（Fargate）', body: 'Fargate は awsvpc しか選べません。タスクごとに ENI と IP が付くので、サブネットの大きさに注意します。' },
    'r-awsvpc': {
      pattern: 'B2',
      title: 'awsvpc（EC2 ならトランキングを有効化）',
      body: 'タスク単位の SG・Flow Logs・障害注入が使え、移行の選択肢も最も広い構成です。トランキングが無効だと、小さいタスクでは 3 倍以上のコストになります。',
    },
    'r-bridge': {
      pattern: 'C',
      title: 'bridge（動的ポート）',
      body: '起動は数秒で、1 台あたりのタスク数も多くできます。引き換えに Flow Logs はインスタンス単位になり、サイドカーには links が必要です。',
    },
    'r-host': {
      pattern: 'D',
      title: 'host',
      body: 'コンテナから IMDS やホストの資源に届きます。デプロイには予備の台数か、処理能力の一時低下が必要です。性能はモード選びの決め手になりにくい点も覚えておきましょう。',
    },
  },
});
