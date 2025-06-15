import * as fs from "fs";
import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";

export class Ec2NginxCloudwatchAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Context
    const sshIp = this.node.tryGetContext("ssh-ip") ?? null;
    const keyPairName = this.node.tryGetContext("key-pair-name") ?? null;

    // VPC
    const vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 2 });

    // Security Group
    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Allow HTTP & SSH",
    });
    if (!sshIp) throw new Error("Please add sshIp");
    securityGroup.addIngressRule(ec2.Peer.ipv4(sshIp), ec2.Port.tcp(22), "SSH");
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP");

    // IAM Role
    const role = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy")
    );

    // Amazon Linux AMI
    const machineImage = ec2.MachineImage.latestAmazonLinux2023();

    // Instance
    if (!keyPairName) throw new Error("Please add key-pair-name");
    const instance = new ec2.Instance(this, "Instance", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage,
      securityGroup,
      role,
      keyPair: ec2.KeyPair.fromKeyPairName(this, "KeyPair", keyPairName),
    });

    // Setup Nginx
    const setupNginxScript = new s3Assets.Asset(this, "SetupNginxAsset", {
      path: path.resolve(__dirname, "../assets/setup-nginx.sh"),
    });
    const setupNginxScriptPath = instance.userData.addS3DownloadCommand({
      bucket: setupNginxScript.bucket,
      bucketKey: setupNginxScript.s3ObjectKey,
    });
    instance.userData.addExecuteFileCommand({
      filePath: setupNginxScriptPath,
    });
    setupNginxScript.grantRead(role);

    // Setup CloudWatch
    const setupCloudWatchScript = new s3Assets.Asset(
      this,
      "SetupCloudWatchAsset",
      {
        path: path.resolve(__dirname, "../assets/setup-cloudwatch.sh"),
      }
    );
    const setupCloudWatchScriptPath = instance.userData.addS3DownloadCommand({
      bucket: setupCloudWatchScript.bucket,
      bucketKey: setupCloudWatchScript.s3ObjectKey,
    });
    instance.userData.addExecuteFileCommand({
      filePath: setupCloudWatchScriptPath,
    });
    setupCloudWatchScript.grantRead(role);

    const userDataScript = fs.readFileSync(
      path.resolve(__dirname, "../assets/setup-nginx.sh"),
      "utf-8"
    );
    instance.addUserData(userDataScript);
  }
}
