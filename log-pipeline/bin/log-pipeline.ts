#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DataLakeStack } from "../lib/data-lake-stack";
import { LogPipelineStack } from "../lib/log-pipeline-stack";
import { LogIngestStack } from "../lib/log-ingest-stack";

const app = new cdk.App();

const stage = app.node.tryGetContext("stage");
if (!stage) throw new Error(`Invalid 'stage' (stage: ${stage})`);

const project = app.node.tryGetContext("project");
if (!project) throw new Error(`Invalid 'project' (project: ${project})`);

const dataLakeStack = new DataLakeStack(app, "data-lake-stack", {
  project,
  stage,
});

const logPipelineStack = new LogPipelineStack(app, "log-pipeline-stack", {
  project,
  stage,
  dataLakeBucket: dataLakeStack.bucket,
});

new LogIngestStack(app, "log-ingest-stack", {
  project,
  stage,
  deliveryStreamArn: logPipelineStack.deliveryStreamArn,
});
