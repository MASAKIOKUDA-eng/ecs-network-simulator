import { App, Tags, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { SiteStack } from '../lib/site-stack.js';
import { acknowledgeNagFindings } from '../lib/nag.js';

const app = new App();

const stack = new SiteStack(app, 'EcsNetworkSimulator', {
  description: 'ECS network mode simulator game (static site on S3 + CloudFront)',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});

Tags.of(app).add('Project', 'ecs-network-simulator');

// cdk-nag でセキュリティのベストプラクティスを検査する（違反があると synth / deploy が止まる）
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
acknowledgeNagFindings(stack);
