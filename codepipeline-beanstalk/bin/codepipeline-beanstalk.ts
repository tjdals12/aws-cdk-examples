#!/usr/bin/env node
import * as dotenv from "dotenv";

import * as cdk from "aws-cdk-lib";
import { BeanstalkStack } from "../lib/beanstalk-stack";
import { CodepipelineStack } from "../lib/codepipeline-stack";
import { NetworkStack } from "../lib/network-stack";
import { RdsStack } from "../lib/rds-stack";

dotenv.config();

const app = new cdk.App();

const networkStack = new NetworkStack(app, "NetworkStack");

const rdsStack = new RdsStack(app, "RdsStack", {
  vpc: networkStack.vpc,
  rdsSecurityGroup: networkStack.rdsSecurityGroup,
});

new BeanstalkStack(app, "BeanstalkStack", {
  vpc: networkStack.vpc,
  instanceSecurityGroup: networkStack.instanceSecurityGroup,
  rdsSecretName: rdsStack.rdsInstance.secret!.secretName,
});

new CodepipelineStack(app, "CodepipelineStack");
