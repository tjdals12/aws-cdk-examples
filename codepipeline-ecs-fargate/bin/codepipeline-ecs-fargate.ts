#!/usr/bin/env node
import * as dotenv from "dotenv";

import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network.stack";
import { BastionHostStack } from "../lib/bastion-host.stack";
import { RdsStack } from "../lib/rds.stack";
import { EcrStack } from "../lib/ecr.stack";
import { CodepipelineStack } from "../lib/codepipeline.stack";
import { EcsFargateStack } from "../lib/ecs-fargate.stack";

dotenv.config();

const app = new cdk.App();

const projectName = "myproject";
const stage = app.node.tryGetContext("stage");
if (!stage) throw new Error();

const projectPrefix = `${projectName}-${stage}`;
const sshIp = process.env.SSH_IP;
if (!sshIp) throw new Error();

const networkStack = new NetworkStack(app, "networkStack", {
  projectPrefix,
  sshIp,
});

const bastionHostStack = new BastionHostStack(app, "bastionHost", {
  projectPrefix,
  vpc: networkStack.vpc,
  instanceSecurityGroup: networkStack.bastionHostSecurityGroup,
});

const rdsStack = new RdsStack(app, "rdsStack", {
  projectPrefix,
  vpc: networkStack.vpc,
  instanceSecurityGroup: networkStack.rdsSecurityGroup,
});

const ecrStack = new EcrStack(app, "ecrStack", {
  projectPrefix,
});

const ecsFargateStack = new EcsFargateStack(app, "ecsFargateStack", {
  projectPrefix,
  vpc: networkStack.vpc,
  appRepository: ecrStack.appRepository,
  rdsSecret: rdsStack.secret,
  fargateServiceSecurityGroup: networkStack.fargateServiceSecurityGroup,
  albSecurityGroup: networkStack.albSecurityGroup,
});

const codepipelineStack = new CodepipelineStack(app, "codepipeline", {
  projectPrefix,
  vpc: networkStack.vpc,
  codebuildSecurityGroup: networkStack.codebuildSecurityGroup,
  appRepository: ecrStack.appRepository,
  nodeRepository: ecrStack.nodeRepository,
  rdsSecret: rdsStack.secret,
  fargateService: ecsFargateStack.fargateService,
});
