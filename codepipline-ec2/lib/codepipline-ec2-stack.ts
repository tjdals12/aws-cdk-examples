import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipelineActions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";

export class CodepiplineEc2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Context
    const sshIp = this.node.tryGetContext("ssh-ip") ?? null;
    if (!sshIp) throw new Error("Please add sshIp");
    const keyPairName = this.node.tryGetContext("key-pair-name") ?? null;
    if (!keyPairName) throw new Error("Please add keyPairName");

    // VPC
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 1,
      subnetConfiguration: [
        { name: "private", subnetType: ec2.SubnetType.PUBLIC },
      ],
    });

    // EC2
    const ec2SecurityGroup = new ec2.SecurityGroup(this, "Ec2SecurityGroup", {
      vpc,
      description: "Security Group for EC2",
      allowAllOutbound: true,
    });
    ec2SecurityGroup.addIngressRule(ec2.Peer.ipv4(sshIp), ec2.Port.SSH, "SSH");
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3000),
      "Nodejs"
    );

    const ec2Role = new iam.Role(this, "Ec2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess"),
      ],
    });

    // Ubuntu 24.04 (amd64)
    const ec2MachineImage = ec2.MachineImage.genericLinux({
      "ap-northeast-2": "ami-0662f4965dfc70aca",
    });

    const ec2Instance = new ec2.Instance(this, "Ec2Instance", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2MachineImage,
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
      keyPair: ec2.KeyPair.fromKeyPairName(this, "Ec2KeyPair", keyPairName),
    });
    cdk.Tags.of(ec2Instance).add("Name", "my-project");

    ec2Instance.userData.addCommands(
      `apt update`,
      `apt install -y curl unzip`,
      `cd /home/ubuntu`,
      `curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"`,
      `unzip awscliv2.zip`,
      `./aws/install`
    );

    const setupCodeDeployAgentScript = new s3Assets.Asset(
      this,
      "SetupCodeDeployAgentScript",
      {
        path: path.resolve(__dirname, "../assets/setup-codedeploy-agent.sh"),
      }
    );
    setupCodeDeployAgentScript.grantRead(ec2Role);
    const setupCodeDeployAgentScriptPath =
      ec2Instance.userData.addS3DownloadCommand({
        bucket: setupCodeDeployAgentScript.bucket,
        bucketKey: setupCodeDeployAgentScript.s3ObjectKey,
      });
    ec2Instance.userData.addExecuteFileCommand({
      filePath: setupCodeDeployAgentScriptPath,
    });

    // source
    // const sourceOutput = new codepipeline.Artifact("SourceArtf");
    // const sourceAction =
    //   new codepipelineActions.CodeStarConnectionsSourceAction({
    //     output: sourceOutput,
    //     actionName: "my-project-source",
    //     owner: "<GITHUB_OWNER>",
    //     repo: "<GITHUB_REPO>",
    //     branch: "<REPO_BRANCH>",
    //     connectionArn:
    //       "<CONNECTION_ARN>",
    //   });

    const sourceOutput = new codepipeline.Artifact("SourceArtf");
    const sourceAction = new codepipelineActions.GitHubSourceAction({
      output: sourceOutput,
      actionName: "my-project-source",
      owner: "<GITHUB_OWNER>",
      repo: "<GITHUB_REPO>",
      branch: "<REPO_BRANCH>",
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
    const pipeline = new codepipeline.Pipeline(this, "CodePipline", {
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

    pipeline.node.addDependency(ec2Instance);
  }
}
