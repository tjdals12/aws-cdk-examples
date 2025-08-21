import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipelineActions from "aws-cdk-lib/aws-codepipeline-actions";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as codebuild from "aws-cdk-lib/aws-codebuild";

export class CodepipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // source
    const sourceOutput = new codepipeline.Artifact("SourceArtf");
    const sourceAction = new codepipelineActions.GitHubSourceAction({
      output: sourceOutput,
      actionName: "myproject-source",
      owner: "tjdals12",
      repo: "nestjs-cdk-example",
      branch: "codepipeline-beanstalk",
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
      actionName: "myproject-build",
      project: new codebuild.PipelineProject(this, "CodeBuild", {
        buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.yml"),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        },
      }),
    });

    // deploy
    const deployAction = new codepipelineActions.ElasticBeanstalkDeployAction({
      input: buildOutput,
      actionName: "myproject-deploy",
      environmentName: "myproject-env",
      applicationName: "myproject",
    });

    new codepipeline.Pipeline(this, "CodePipeline", {
      pipelineName: "myproject-pipeline",
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
