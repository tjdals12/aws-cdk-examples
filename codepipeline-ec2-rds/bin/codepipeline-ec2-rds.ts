#!/usr/bin/env node
import * as dotenv from "dotenv";
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network.stack";
import { Ec2Stack } from "../lib/ec2.stack";
import { RdsStack } from "../lib/rds.stack";
import { CodepipelineStack } from "../lib/codepipeline.stack";
import { CloudWatchDashboardStack } from "../lib/cloudwatch-dashboard.stack";

dotenv.config();

const app = new cdk.App();

const stage = app.node.tryGetContext("stage");
if (!stage) throw new Error();

const SSH_IP = process.env.SSH_IP;
if (!SSH_IP) throw new Error();

const ALARM_EMAILS = process.env.ALARM_EMAILS;
if (!ALARM_EMAILS) throw new Error();

const alarmEmails = ALARM_EMAILS.split(",");
if (alarmEmails.length === 0) throw new Error();

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
if (!SLACK_WEBHOOK_URL) throw new Error();

const project = app.node.tryGetContext("project")[stage];
if (!project) throw new Error();

const github = app.node.tryGetContext("github")[stage];
if (!github) throw new Error();

const networkStack = new NetworkStack(app, "network-stack", {
  project,
  sshIp: SSH_IP,
});

const rdsStack = new RdsStack(app, "rds-stack", {
  project,
  vpc: networkStack.vpc,
  securityGroup: networkStack.rdsSecurityGroup,
});

const ec2Stack = new Ec2Stack(app, "ec2-stack", {
  project,
  vpc: networkStack.vpc,
  securityGroup: networkStack.ec2SecurityGroup,
  rdsSecret: rdsStack.secret,
});

const codepipelinStack = new CodepipelineStack(app, "codepipeline-stack", {
  project,
  github,
  vpc: networkStack.vpc,
  codebuildSecurityGroup: networkStack.codebuildSecurityGroup,
  rdsSecret: rdsStack.secret,
  ec2Role: ec2Stack.role,
});

const cloudwatchDashboardStack = new CloudWatchDashboardStack(
  app,
  "cloudwatch-dashboard-stack",
  {
    project,
    emails: alarmEmails,
    slackWebhookUrl: SLACK_WEBHOOK_URL,
    ec2Instance: ec2Stack.instance,
    rdsInstance: rdsStack.instance,
  }
);
