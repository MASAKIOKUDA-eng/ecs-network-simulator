import { DefaultStackSynthesizer, Token, Validations, type Stack } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';
import type { SiteStack } from './site-stack.js';

/**
 * 意図して受け入れている cdk-nag の指摘だけを、理由つきで認める（acknowledge）。
 * 範囲はできるだけ狭くし、スタック全体ではなく対象のリソースに付ける。
 */
export function acknowledgeNagFindings(stack: SiteStack): void {
  Validations.of(stack.bucket).acknowledge({
    id: 'AwsSolutions-S1',
    reason: '公開するのは個人情報を含まない静的な学習用コンテンツのみ。コスト最小化のためサーバーアクセスログは取らない（README に有効化の方法あり）',
  });

  const dist = stack.distribution;
  Validations.of(dist).acknowledge({ id: 'AwsSolutions-CFR1', reason: '世界中の学習者に公開するため地域制限は行わない' });
  Validations.of(dist).acknowledge({
    id: 'AwsSolutions-CFR2',
    reason: '静的ファイルのみでフォーム・API・ログインがなく、WAF の固定費（月 $5 以上）に見合う攻撃面がない。DDoS は CloudFront 標準の Shield Standard で受ける',
  });
  Validations.of(dist).acknowledge({ id: 'AwsSolutions-CFR3', reason: 'コスト最小化のためアクセスログは取らない（README に有効化の方法あり）' });
  Validations.of(dist).acknowledge({
    id: 'AwsSolutions-CFR4',
    reason: '独自ドメインを使わず CloudFront の既定証明書を使うため、最低 TLS バージョンを指定できない。独自ドメインと ACM 証明書を使う場合は TLSv1.2_2021 を指定する',
  });

  // BucketDeployment が作る CDK 管理の Lambda（デプロイ時にだけ動く）
  for (const handler of cdkManagedHandlers(stack)) {
    Validations.of(handler).acknowledge({
      id: 'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]',
      reason: 'CDK が作るデプロイ用 Lambda の AWSLambdaBasicExecutionRole（CloudWatch Logs への書き込みのみ）',
    });
    // IAM5 は指摘ごとに ID が分かれるため、生成されるポリシーの項目を 1 つずつ認める（新しいワイルドカードが増えたら止まる）
    for (const finding of bucketDeploymentWildcards(stack)) {
      Validations.of(handler).acknowledge({
        id: `AwsSolutions-IAM5[${finding}]`,
        reason: 'CDK の BucketDeployment が生成するポリシー。対象はアセット用バケットとこのスタックのサイト用バケットのオブジェクト、および CloudFront の無効化（リソースを指定できない API）に限られる',
      });
    }
    Validations.of(handler).acknowledge({
      id: 'AwsSolutions-L1',
      reason: 'ランタイムは CDK の BucketDeployment が管理し、aws-cdk-lib の更新で追従する',
    });
  }
}

/** BucketDeployment はスタック直下にシングルトンの Lambda を作る */
function cdkManagedHandlers(stack: Stack): IConstruct[] {
  return stack.node.children.filter((c) => c.node.id.startsWith('Custom::CDKBucketDeployment'));
}

function bucketDeploymentWildcards(stack: SiteStack): string[] {
  const region = Token.isUnresolved(stack.region) ? '<AWS::Region>' : stack.region;
  const assetBucket = `cdk-${DefaultStackSynthesizer.DEFAULT_QUALIFIER}-assets-<AWS::AccountId>-${region}`;
  const siteBucketId = stack.getLogicalId(stack.bucket.node.defaultChild as never);
  return [
    'Action::s3:GetBucket*',
    'Action::s3:GetObject*',
    'Action::s3:List*',
    'Action::s3:Abort*',
    'Action::s3:DeleteObject*',
    `Resource::arn:<AWS::Partition>:s3:::${assetBucket}/*`,
    `Resource::<${siteBucketId}.Arn>/*`,
    'Resource::*',
  ];
}
