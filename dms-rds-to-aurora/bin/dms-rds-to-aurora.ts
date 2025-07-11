#!/usr/bin/env node

import * as dotenv from "dotenv";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { NetworkStack } from "../lib/network.stack";
import { BastionHostStack } from "../lib/bastion-host.stack";
import { RdsStack } from "../lib/rds.stack";
import { AuroraStack } from "../lib/aurora.stack";
import { DmsStack } from "../lib/dms.stack";

dotenv.config();

const sshIp = process.env.SSH_IP;
if (!sshIp) throw new Error("SSH_IP is undefined.");

const app = new cdk.App();

const networkStack = new NetworkStack(app, "NetworkStack");

const rdsStack = new RdsStack(app, "RdsStack", {
  vpc: networkStack.vpc,
});

const auroraStack = new AuroraStack(app, "AuroraStack", {
  vpc: networkStack.vpc,
});

const bastionHostStack = new BastionHostStack(app, "BastionHostStack", {
  vpc: networkStack.vpc,
  sshIp,
  sourceDatabaseSecurityGroupId: rdsStack.securityGroup.securityGroupId,
  targetDatabaseSecurityGroupId: auroraStack.securityGroup.securityGroupId,
});

const dmsStack = new DmsStack(app, "DmsStack", {
  vpc: networkStack.vpc,
  sourceDatabaseSecretArn: rdsStack.secret.secretArn,
  sourceDatabaseSecurityGroupId: rdsStack.securityGroup.securityGroupId,
  targetDatabaseSecretArn: auroraStack.secret.secretArn,
  targetDatabaseSecurityGroupId: auroraStack.securityGroup.securityGroupId,
});
