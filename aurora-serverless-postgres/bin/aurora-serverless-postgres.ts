#!/usr/bin/env node
import * as dotenv from "dotenv";

import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { BastionHostStack } from "../lib/bastion-host.stack";
import { AuroraServerlessPostgresStack } from "../lib/aurora-serverless-postgres-stack";

dotenv.config();

const app = new cdk.App();

const networkStack = new NetworkStack(app, "NetworkStack");

const bastionHostStack = new BastionHostStack(app, "BastionHostStack", {
  vpc: networkStack.vpc,
});

new AuroraServerlessPostgresStack(app, "AuroraServerlessPostgresStack", {
  vpc: networkStack.vpc,
  bastionHostSecurityGroup: bastionHostStack.instanceSecurityGroup,
});
