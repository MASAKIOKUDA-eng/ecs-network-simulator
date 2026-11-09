import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { SiteStack } from '../lib/site-stack.js';
import headers from '../config/security-headers.json' with { type: 'json' };

const template = Template.fromStack(new SiteStack(new App(), 'Test', { env: { region: 'us-east-1' } }));

test('S3 バケットは非公開・暗号化・TLS 必須', () => {
  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    BucketEncryption: Match.objectLike({}),
    OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
  });
  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
      ]),
    },
  });
});

test('バケットポリシーは CloudFront の OAC（このディストリビューション）だけに読み取りを許可する', () => {
  template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Effect: 'Allow',
          Action: 's3:GetObject',
          Principal: { Service: 'cloudfront.amazonaws.com' },
          Condition: { StringEquals: { 'AWS:SourceArn': Match.anyValue() } },
        }),
      ]),
    },
  });
});

test('CloudFront は HTTPS にリダイレクトし、GET / HEAD だけを許可する', () => {
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultRootObject: 'index.html',
      PriceClass: 'PriceClass_100',
      DefaultCacheBehavior: Match.objectLike({
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: ['GET', 'HEAD'],
      }),
    }),
  });
});

test('セキュリティヘッダー（CSP・HSTS・X-Frame-Options など）を付ける', () => {
  template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
    ResponseHeadersPolicyConfig: Match.objectLike({
      SecurityHeadersConfig: Match.objectLike({
        ContentSecurityPolicy: { ContentSecurityPolicy: headers.contentSecurityPolicy, Override: true },
        ContentTypeOptions: { Override: true },
        FrameOptions: { FrameOption: 'DENY', Override: true },
        StrictTransportSecurity: Match.objectLike({ AccessControlMaxAgeSec: headers.hstsMaxAgeSeconds, IncludeSubdomains: true }),
      }),
    }),
  });
  const csp = headers.contentSecurityPolicy;
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /require-trusted-types-for 'script'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
});

test('常時課金されるリソース（WAF・NAT・EC2 など）を作らない', () => {
  const types = new Set(Object.values(template.toJSON().Resources as Record<string, { Type: string }>).map((r) => r.Type));
  for (const costly of ['AWS::WAFv2::WebACL', 'AWS::EC2::NatGateway', 'AWS::EC2::Instance', 'AWS::ElasticLoadBalancingV2::LoadBalancer']) {
    assert.equal(types.has(costly), false, costly);
  }
  template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 });
});
