import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface NetworkStackProps extends cdk.StackProps {
  projectPrefix: string;
  sshIp: string;
}

export class NetworkStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly codebuildSecurityGroup: ec2.SecurityGroup;
  readonly bastionHostSecurityGroup: ec2.SecurityGroup;
  readonly fargateServiceSecurityGroup: ec2.SecurityGroup;
  readonly albSecurityGroup: ec2.SecurityGroup;
  readonly rdsSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { projectPrefix, sshIp } = props;

    const vpc = new ec2.Vpc(this, "vpc", {
      vpcName: `${projectPrefix}-vpc`,
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

    const codebuildSecurityGroup = new ec2.SecurityGroup(
      this,
      "codebuildSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
      }
    );

    const bastionHostSecurityGroup = new ec2.SecurityGroup(
      this,
      "bastionHostSecurityGroup",
      {
        securityGroupName: `${projectPrefix}-bastionHostSecurityGroup`,
        vpc,
        allowAllOutbound: true,
      }
    );
    bastionHostSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(sshIp),
      ec2.Port.SSH,
      "Allow SSH from local"
    );

    const albSecurityGroup = new ec2.SecurityGroup(this, "albSecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.HTTP,
      "Allow HTTP from public"
    );

    const fargateServiceSecurityGroup = new ec2.SecurityGroup(
      this,
      "fargateServiceSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
      }
    );
    fargateServiceSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(3000),
      "Allow nodejs from ALB"
    );

    const rdsSecurityGroup = new ec2.SecurityGroup(this, "rdsSecurityGroup", {
      securityGroupName: `${projectPrefix}-rdsSecurityGroup`,
      vpc,
      allowAllOutbound: true,
    });
    rdsSecurityGroup.addIngressRule(
      codebuildSecurityGroup,
      ec2.Port.POSTGRES,
      "Allow Postgres from Codebuild"
    );
    rdsSecurityGroup.addIngressRule(
      bastionHostSecurityGroup,
      ec2.Port.POSTGRES,
      "Allow Postgres from Bastion Host"
    );
    rdsSecurityGroup.addIngressRule(
      fargateServiceSecurityGroup,
      ec2.Port.POSTGRES,
      "Allow Postgres from Fargate"
    );

    this.vpc = vpc;
    this.codebuildSecurityGroup = codebuildSecurityGroup;
    this.bastionHostSecurityGroup = bastionHostSecurityGroup;
    this.albSecurityGroup = albSecurityGroup;
    this.fargateServiceSecurityGroup = fargateServiceSecurityGroup;
    this.rdsSecurityGroup = rdsSecurityGroup;
  }
}
