import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";

export class Ec2RdsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Context
    const sshIp = this.node.tryGetContext("ssh-ip") ?? null;
    if (!sshIp) throw new Error("Please add sshIp");
    const keyPairName = this.node.tryGetContext("key-pair-name") ?? null;
    if (!keyPairName) throw new Error("Please add keyPairName");

    // VPC
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "private_1", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { name: "private_2", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    // EC2 - Security Group
    const ec2SecurityGroup = new ec2.SecurityGroup(this, "Ec2SecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });
    ec2SecurityGroup.addIngressRule(ec2.Peer.ipv4(sshIp), ec2.Port.SSH, "SSH");
    ec2SecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.HTTP, "HTTP");

    // EC2 - IAM Role
    const ec2Role = new iam.Role(this, "Ec2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    // EC2 - Machine Image
    const ec2MachineImage = ec2.MachineImage.latestAmazonLinux2023();

    // EC2 - Instance
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

    const setupNodeScript = new s3Assets.Asset(this, "SetupNodeScript", {
      path: path.resolve(__dirname, "../assets/setup-node.sh"),
    });
    const setupNodeScriptPath = ec2Instance.userData.addS3DownloadCommand({
      bucket: setupNodeScript.bucket,
      bucketKey: setupNodeScript.s3ObjectKey,
    });
    ec2Instance.userData.addExecuteFileCommand({
      filePath: setupNodeScriptPath,
    });
    setupNodeScript.grantRead(ec2Role);

    // RDS - Security Group
    const rdsSecurityGroup = new ec2.SecurityGroup(this, "RdsSecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });
    rdsSecurityGroup.addIngressRule(
      ec2SecurityGroup,
      ec2.Port.POSTGRES,
      "Postgres"
    );

    // RDS - Instance
    const rdsInstance = new rds.DatabaseInstance(this, "RdsInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_8,
      }),
      credentials: rds.Credentials.fromGeneratedSecret("postgres"),
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      publiclyAccessible: false,
      securityGroups: [rdsSecurityGroup],
    });

    // Output
    new cdk.CfnOutput(this, "RDS Endpoint", {
      value: rdsInstance.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "EC2 Public IP", {
      value: ec2Instance.instancePublicIp,
    });
  }
}
