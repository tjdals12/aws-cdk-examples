import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as elbv2Targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";

export class Ec2ElbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Context
    const sshIp = this.node.tryGetContext("ssh-ip") ?? null;
    const keyPairName = this.node.tryGetContext("key-pair-name") ?? null;

    // VPC
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
    });

    // EC2 - Security Group
    const ec2SecurityGroup = new ec2.SecurityGroup(this, "Ec2SecurityGroup", {
      vpc,
    });
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(sshIp),
      ec2.Port.tcp(22),
      "SSH"
    );

    // EC2 - IAM Role
    const ec2Role = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    // EC2 - Amazon Linux AMI
    const ec2MachineImage = ec2.MachineImage.latestAmazonLinux2023();

    // EC2 - Instance
    const ec2Instance = new ec2.Instance(this, "Ec2Instance", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2MachineImage,
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
      keyPair: ec2.KeyPair.fromKeyPairName(this, "Ec2KeyPair", keyPairName),
    });

    // EC2 - Setup Nginx
    const setupNginxScript = new s3Assets.Asset(this, "SetupNginxAsset", {
      path: path.resolve(__dirname, "../assets/setup-nginx.sh"),
    });
    setupNginxScript.grantRead(ec2Role);
    const setupNginxScriptPath = ec2Instance.userData.addS3DownloadCommand({
      bucket: setupNginxScript.bucket,
      bucketKey: setupNginxScript.s3ObjectKey,
    });
    ec2Instance.userData.addExecuteFileCommand({
      filePath: setupNginxScriptPath,
    });

    // ALB - Security Group
    const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc,
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.HTTP,
      "Allow HTTP from Internet"
    );
    ec2SecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.HTTP,
      "Allow HTTP from ALB"
    );

    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    // ALB - Listener
    const albTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "ALBTargetGroup",
      {
        vpc,
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.INSTANCE,
        healthCheck: {
          path: "/",
          healthyHttpCodes: "200",
        },
      }
    );
    albTargetGroup.addTarget(new elbv2Targets.InstanceTarget(ec2Instance));
    const albListener = alb.addListener("Listener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      open: true,
    });
    albListener.addTargetGroups("DefaultTargetGroup", {
      targetGroups: [albTargetGroup],
    });

    // const albListener = alb.addListener("Listener", {
    //   protocol: elbv2.ApplicationProtocol.HTTP,
    //   port: 80,
    //   open: true,
    // });
    // albListener.addTargets("Ec2Target", {
    //   protocol: elbv2.ApplicationProtocol.HTTP,
    //   port: 80,
    //   targets: [new elbv2Targets.InstanceTarget(ec2Instance)],
    //   healthCheck: {
    //     path: "/",
    //     healthyHttpCodes: "200",
    //   },
    // });

    // Route 53
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: "iammin.shop",
    });
    new route53.ARecord(this, "AliasRecord", {
      zone: hostedZone,
      recordName: "app",
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(alb)
      ),
    });

    // Output
    new cdk.CfnOutput(this, "ALBDNS", {
      value: `http://${alb.loadBalancerDnsName}`,
    });
  }
}
