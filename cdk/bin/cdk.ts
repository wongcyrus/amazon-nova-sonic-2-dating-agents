#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AmazonNovaSonicDatingAgentsStack } from '../lib/cdk-stack';

const app = new cdk.App();
new AmazonNovaSonicDatingAgentsStack(app, 'AmazonNovaSonicDatingAgentsStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic. */
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

app.synth();