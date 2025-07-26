import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipelineActions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";

interface CodepipelineStackProps extends cdk.StackProps {
  project: string;
  github: {
    owner: string;
    repo: string;
    branch: string;
  };
  vpc: ec2.IVpc;
  codebuildSecurityGroup: ec2.ISecurityGroup;
  rdsSecret: secretsmanager.ISecret;
  ec2Role: iam.IRole;
}

export class CodepipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CodepipelineStackProps) {
    super(scope, id, props);

    const { project, github, vpc, codebuildSecurityGroup, rdsSecret, ec2Role } =
      props;
    const { owner, repo, branch } = github;

    const oauthToken = secretsmanager.Secret.fromSecretNameV2(
      this,
      "github-token",
      "github-token"
    ).secretValue;
    const sourceOutput = new codepipeline.Artifact("source-artifact");
    const sourceAction = new codepipelineActions.GitHubSourceAction({
      actionName: `${project}-source-action`,
      owner,
      repo,
      branch,
      oauthToken,
      output: sourceOutput,
      trigger: codepipelineActions.GitHubTrigger.WEBHOOK,
    });

    const buildProject = new codebuild.PipelineProject(this, "build-project", {
      projectName: `${project}-build-project`,
      buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.yml"),
      vpc,
      subnetSelection: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [codebuildSecurityGroup],
      environmentVariables: {
        DB_SECRET: {
          type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
          value: rdsSecret.secretArn,
        },
      },
    });
    const buildOutput = new codepipeline.Artifact("build-artifact");
    const buildAction = new codepipelineActions.CodeBuildAction({
      actionName: `${project}-build-action`,
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });

    const application = new codedeploy.ServerApplication(
      this,
      "server-application",
      {
        applicationName: `${project}-app`,
      }
    );
    const ec2InstanceTags = new codedeploy.InstanceTagSet({
      Name: [project],
    });
    const deploymentGroup = new codedeploy.ServerDeploymentGroup(
      this,
      "server-deployment-config",
      {
        deploymentGroupName: `${project}-deployment-group`,
        application,
        deploymentConfig: codedeploy.ServerDeploymentConfig.ALL_AT_ONCE,
        ec2InstanceTags,
      }
    );
    const deployAction = new codepipelineActions.CodeDeployServerDeployAction({
      actionName: `${project}-deploy-action`,
      deploymentGroup,
      input: buildOutput,
    });

    const artifactBucket = new s3.Bucket(this, "artifact-bucket", {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    artifactBucket.grantRead(ec2Role);
    new codepipeline.Pipeline(this, "pipeline", {
      pipelineName: `${project}-pipeline`,
      stages: [
        {
          stageName: "source-stage",
          actions: [sourceAction],
        },
        {
          stageName: "build-stage",
          actions: [buildAction],
        },
        {
          stageName: "deploy-stage",
          actions: [deployAction],
        },
      ],
      artifactBucket,
    });
  }
}
