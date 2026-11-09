import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import headers from '../config/security-headers.json' with { type: 'json' };

const here = path.dirname(fileURLToPath(import.meta.url));
export const SITE_DIR = path.join(here, '..', 'site');

/**
 * 静的サイトの配信（コスト最小の構成）
 *
 * - S3：非公開（パブリックアクセスをすべてブロック）。CloudFront の OAC からだけ読める
 * - CloudFront：HTTPS へリダイレクト、セキュリティヘッダーを付与、北米・欧州のエッジのみ（PriceClass_100）
 * - 常時動くものはない。BucketDeployment の Lambda はデプロイ時に一度だけ動く
 */
export class SiteStack extends Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: false,
      // 学習用の使い捨て環境なので、削除時に中身ごと消す（消し忘れの課金を防ぐ）
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      comment: 'ecs-network-simulator security headers',
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: headers.contentSecurityPolicy, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.seconds(headers.hstsMaxAgeSeconds),
          includeSubdomains: true,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Permissions-Policy', value: headers.permissionsPolicy, override: true },
          { header: 'Cross-Origin-Opener-Policy', value: headers.crossOriginOpenerPolicy, override: true },
          { header: 'Cross-Origin-Resource-Policy', value: headers.crossOriginResourcePolicy, override: true },
        ],
      },
      removeHeaders: ['Server'],
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'ECS network simulator (static site)',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
        compress: true,
      },
      // OAC で ListBucket を許可しないため、存在しないキーは 403 になる。どちらも 404 ページを返す
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: Duration.minutes(5) },
      ],
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: true,
    });

    // デプロイ時だけ動く Lambda のログ。保持期間を短くしてコストを抑える
    const deployLogGroup = new logs.LogGroup(this, 'DeployLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(SITE_DIR)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'], // 無効化は月 1,000 パスまで無料。'/*' は 1 パスとして数えられる
      prune: true,
      memoryLimit: 256,
      logGroup: deployLogGroup,
    });

    new CfnOutput(this, 'SiteUrl', { value: `https://${this.distribution.distributionDomainName}` });
    new CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
  }
}
