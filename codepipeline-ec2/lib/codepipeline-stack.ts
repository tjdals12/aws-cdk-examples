import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipelineActions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";

export class CodepipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // const codeStarConnectionArn = process.env.CODE_STAR_CONNECTION_ARM;
    // if (!codeStarConnectionArn)
    //   throw new Error("Please add CODE_STAR_CONNECTION_ARM");

    // source
    // const sourceOutput = new codepipeline.Artifact("SourceArtf");
    // const sourceAction =
    //   new codepipelineActions.CodeStarConnectionsSourceAction({
    //     output: sourceOutput,
    //     actionName: "my-project-source",
    //     owner: "tjdals12",
    //     repo: "my-project",
    //     branch: "main",
    //     connectionArn: codeStarConnectionArn,
    //   });

    const sourceOutput = new codepipeline.Artifact("SourceArtf");
    const sourceAction = new codepipelineActions.GitHubSourceAction({
      output: sourceOutput,
      actionName: "my-project-source",
      owner: "tjdals12",
      repo: "my-project",
      branch: "main",
      oauthToken: secretsmanager.Secret.fromSecretNameV2(
        this,
        "GithubToken",
        "github-token"
      ).secretValue,
      trigger: codepipelineActions.GitHubTrigger.WEBHOOK,
    });

    // build
    const buildOutput = new codepipeline.Artifact("BuildArtf");
    const buildAction = new codepipelineActions.CodeBuildAction({
      input: sourceOutput,
      outputs: [buildOutput],
      actionName: "my-project-build",
      project: new codebuild.PipelineProject(this, "CodeBuild", {
        buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.yml"),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        },
      }),
    });

    // deploy
    const deployAction = new codepipelineActions.CodeDeployServerDeployAction({
      input: buildOutput,
      actionName: "my-project-deploy",
      deploymentGroup: new codedeploy.ServerDeploymentGroup(
        this,
        "CodeDeployDeploymentGroup",
        {
          application: new codedeploy.ServerApplication(
            this,
            "CodeDeployApplication"
          ),
          deploymentConfig: codedeploy.ServerDeploymentConfig.ALL_AT_ONCE,
          ec2InstanceTags: new codedeploy.InstanceTagSet({
            Name: ["my-project"],
          }),
          installAgent: true,
        }
      ),
    });

    // pipeline
    new codepipeline.Pipeline(this, "CodePipline", {
      pipelineName: "my-project-pipeline",
      stages: [
        {
          stageName: "Source",
          actions: [sourceAction],
        },
        {
          stageName: "Build",
          actions: [buildAction],
        },
        {
          stageName: "Deploy",
          actions: [deployAction],
        },
      ],
    });
  }
}
