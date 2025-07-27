import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

interface Ec2StackProps extends cdk.StackProps {
  project: string;
  vpc: ec2.IVpc;
  securityGroup: ec2.ISecurityGroup;
  rdsSecret: secretsmanager.ISecret;
}

export class Ec2Stack extends cdk.Stack {
  readonly role: iam.IRole;
  readonly instance: ec2.IInstance;

  constructor(scope: Construct, id: string, props: Ec2StackProps) {
    super(scope, id, props);

    const { project, vpc, securityGroup, rdsSecret } = props;

    const role = new iam.Role(this, "ec2-role", {
      roleName: `${project}-ec2-role`,
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy"
        ),
      ],
    });

    const instanceType = ec2.InstanceType.of(
      ec2.InstanceClass.T3,
      ec2.InstanceSize.SMALL
    );

    const machineImage = ec2.MachineImage.latestAmazonLinux2023();

    const keyPair = ec2.KeyPair.fromKeyPairName(
      this,
      "ec2-key-pair",
      `${project}-key-pair`
    );

    const instance = new ec2.Instance(this, "ec2-instance", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType,
      machineImage,
      securityGroup,
      role,
      keyPair,
    });
    cdk.Tags.of(instance).add("Name", project);

    const setupNginxScriptAsset = new s3Assets.Asset(
      this,
      "setup-nginx-script",
      {
        path: path.resolve(__dirname, "../assets/setup-nginx.sh"),
      }
    );
    setupNginxScriptAsset.grantRead(role);
    const setupNginxScriptPath = instance.userData.addS3DownloadCommand({
      bucket: setupNginxScriptAsset.bucket,
      bucketKey: setupNginxScriptAsset.s3ObjectKey,
    });
    instance.userData.addExecuteFileCommand({
      filePath: setupNginxScriptPath,
    });

    const setupCloudWatchAgentScriptAsset = new s3Assets.Asset(
      this,
      "setup-cloudwatch-agent",
      {
        path: path.resolve(__dirname, "../assets/setup-cloudwatch-agent.sh"),
      }
    );
    setupCloudWatchAgentScriptAsset.grantRead(role);
    const setupCloudWatchAgentScriptPath =
      instance.userData.addS3DownloadCommand({
        bucket: setupCloudWatchAgentScriptAsset.bucket,
        bucketKey: setupCloudWatchAgentScriptAsset.s3ObjectKey,
      });
    instance.userData.addExecuteFileCommand({
      filePath: setupCloudWatchAgentScriptPath,
    });

    const setupCodedeployAgentScriptAsset = new s3Assets.Asset(
      this,
      "setup-codedeploy-agent",
      {
        path: path.resolve(__dirname, "../assets/setup-codedeploy-agent.sh"),
      }
    );
    setupCodedeployAgentScriptAsset.grantRead(role);
    const setupCodedeployAgentScriptPath =
      instance.userData.addS3DownloadCommand({
        bucket: setupCodedeployAgentScriptAsset.bucket,
        bucketKey: setupCodedeployAgentScriptAsset.s3ObjectKey,
      });
    instance.userData.addExecuteFileCommand({
      filePath: setupCodedeployAgentScriptPath,
    });

    const setupNvmScriptAsset = new s3Assets.Asset(this, "setup-nvm", {
      path: path.resolve(__dirname, "../assets/setup-nvm.sh"),
    });
    setupNvmScriptAsset.grantRead(role);
    const setupNvmScriptPath = instance.userData.addS3DownloadCommand({
      bucket: setupNvmScriptAsset.bucket,
      bucketKey: setupNvmScriptAsset.s3ObjectKey,
    });
    instance.userData.addExecuteFileCommand({
      filePath: setupNvmScriptPath,
    });

    instance.addUserData(
      `echo "SECRET_NAME=${rdsSecret.secretName}" >> /etc/environment`
    );
    rdsSecret.grantRead(role);

    this.role = role;
    this.instance = instance;
  }
}
