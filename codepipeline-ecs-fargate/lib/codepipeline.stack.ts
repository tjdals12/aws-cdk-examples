import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipelineActions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as s3 from "aws-cdk-lib/aws-s3";

export interface CodepipelineStackProps extends cdk.StackProps {
  projectPrefix: string;
  vpc: ec2.Vpc;
  codebuildSecurityGroup: ec2.SecurityGroup;
  appRepository: ecr.IRepository;
  nodeRepository: ecr.IRepository;
  rdsSecret: secretsmanager.ISecret;
  fargateService: ecs.FargateService;
}

export class CodepipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CodepipelineStackProps) {
    super(scope, id, props);

    const {
      projectPrefix,
      vpc,
      codebuildSecurityGroup,
      appRepository,
      nodeRepository,
      rdsSecret,
      fargateService,
    } = props;

    const oauthToken = secretsmanager.Secret.fromSecretNameV2(
      this,
      "githubOAuthToken",
      "github-token"
    ).secretValue;
    const sourceOutput = new codepipeline.Artifact("SourceArtifact");
    const sourceAction = new codepipelineActions.GitHubSourceAction({
      actionName: `${projectPrefix}-sourceAction`,
      output: sourceOutput,
      owner: "tjdals12",
      repo: "nestjs-monorepo-ecs",
      branch: "main",
      oauthToken,
      trigger: codepipelineActions.GitHubTrigger.WEBHOOK,
    });

    const buildSpec = codebuild.BuildSpec.fromObjectToYaml({
      version: 0.2,
      phases: {
        install: {
          "runtime-versions": {
            nodejs: 22,
          },
          commands: [
            `echo "Installing jq..."`,
            `apt-get update && apt-get install -y jq`,

            `echo "Installing pnpm..."`,
            `npm install -g pnpm`,

            `echo "Installing dependencies..."`,
            `pnpm install --frozen-lockfile`,

            `echo "Parsing daabase secret..."`,
            `DB_USER=$(echo $DB_SECRET | jq -r '.username')`,
            `DB_PASSWORD=$(echo $DB_SECRET | jq -r '.password')`,
            `DB_HOST=$(echo $DB_SECRET | jq -r '.host')`,
            `DB_PORT=$(echo $DB_SECRET | jq -r '.port')`,
            'export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres?schema=public"',
          ],
        },
        pre_build: {
          on_failure: "ABORT",
          commands: [
            `echo "logging in to Amazon ECR..."`,
            "aws ecr get-login-password | docker login --username AWS --password-stdin $REPOSITORY_URI",
            "COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)",
          ],
        },
        build: {
          on_failure: "ABORT",
          commands: [
            `echo "Building Docker image..."`,
            "docker build -t $REPOSITORY_URI:latest -t $REPOSITORY_URI:$COMMIT_HASH .",
          ],
        },
        post_build: {
          commands: [
            `echo "Pushing Docker images..."`,
            "docker push $REPOSITORY_URI:latest",
            "docker push $REPOSITORY_URI:$COMMIT_HASH",

            `echo "Writing image definitions file..."`,
            `printf '[{"name": "app", "imageUri": "%s"}]' "$REPOSITORY_URI:$COMMIT_HASH" > imagedefinitions.json`,

            `echo "Running Prisma migration..."`,
            `pnpm prisma migrate deploy`,
          ],
        },
      },
      artifacts: {
        files: ["imagedefinitions.json"],
      },
    });
    const buildProject = new codebuild.PipelineProject(this, "buildProject", {
      vpc,
      subnetSelection: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [codebuildSecurityGroup],
      buildSpec,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
      },
      environmentVariables: {
        REPOSITORY_URI: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: appRepository.repositoryUri,
        },
        DB_SECRET: {
          type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
          value: rdsSecret.secretArn,
        },
      },
    });
    nodeRepository.grantPull(buildProject);
    appRepository.grantPullPush(buildProject);

    const buildOutput = new codepipeline.Artifact("BuildArtifact");
    const buildAction = new codepipelineActions.CodeBuildAction({
      actionName: `${projectPrefix}-buildAction`,
      input: sourceOutput,
      outputs: [buildOutput],
      project: buildProject,
    });

    const deployAction = new codepipelineActions.EcsDeployAction({
      actionName: `${projectPrefix}-deployAction`,
      input: buildOutput,
      service: fargateService,
    });

    const artifactBucket = new s3.Bucket(this, "artifactBucket", {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const pipeline = new codepipeline.Pipeline(this, "pipeline", {
      pipelineName: `${projectPrefix}-pipeline`,
      stages: [
        {
          stageName: "source",
          actions: [sourceAction],
        },
        {
          stageName: "build",
          actions: [buildAction],
        },
        {
          stageName: "Deploy",
          actions: [deployAction],
        },
      ],
      artifactBucket,
    });
  }
}
