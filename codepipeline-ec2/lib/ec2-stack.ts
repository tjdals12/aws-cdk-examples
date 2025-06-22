import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";

export class Ec2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Context
    const sshIp = process.env.SSH_IP;
    if (!sshIp) throw new Error("Please add SSH_IP");

    const keyPairName = process.env.KEY_PAIR_NAME;
    if (!keyPairName) throw new Error("Please add KEY_PAIR_NAME");

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
  }
}
