import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";

interface NetworkStackProps extends cdk.StackProps {
  project: string;
  sshIp: string;
}

export class NetworkStack extends cdk.Stack {
  readonly vpc: ec2.IVpc;
  readonly codebuildSecurityGroup: ec2.ISecurityGroup;
  readonly ec2SecurityGroup: ec2.ISecurityGroup;
  readonly rdsSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { project, sshIp } = props;

    const vpc = new ec2.Vpc(this, "vpc", {
      vpcName: `${project}-vpc`,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    const codebuildSecurityGroup = new ec2.SecurityGroup(this, "codebuild-sg", {
      securityGroupName: `${project}-codebuild-sg`,
      description: "Security group for Codebuild",
      vpc,
      allowAllOutbound: true,
    });

    const ec2SecurityGroup = new ec2.SecurityGroup(this, "ec2-sg", {
      securityGroupName: `${project}-ec2-sg`,
      description: "Security group for EC2",
      vpc,
      allowAllOutbound: true,
    });
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(sshIp),
      ec2.Port.SSH,
      "Allow SSH from local"
    );
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.HTTPS,
      "Allow HTTPS from public"
    );
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.HTTP,
      "Allow HTTP from public"
    );

    const rdsSecurityGroup = new ec2.SecurityGroup(this, "rds-sg", {
      securityGroupName: `${project}-rds-sg`,
      description: "Security group for RDS",
      vpc,
      allowAllOutbound: true,
    });
    rdsSecurityGroup.addIngressRule(
      ec2SecurityGroup,
      ec2.Port.POSTGRES,
      "Allow Postgres from EC2"
    );
    rdsSecurityGroup.addIngressRule(
      codebuildSecurityGroup,
      ec2.Port.POSTGRES,
      "Allow Postgres from Codebuild"
    );

    this.vpc = vpc;
    this.codebuildSecurityGroup = codebuildSecurityGroup;
    this.ec2SecurityGroup = ec2SecurityGroup;
    this.rdsSecurityGroup = rdsSecurityGroup;
  }
}
