import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export class NetworkStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly instanceSecurityGroup: ec2.SecurityGroup;
  readonly rdsSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      ],
    });

    const instanceSecurityGroup = new ec2.SecurityGroup(
      this,
      "InstanceSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
        description: "Security Group for EC2 Instance",
      }
    );
    cdk.Tags.of(instanceSecurityGroup).add("Name", "sg-ec2");

    const rdsSecurityGruop = new ec2.SecurityGroup(this, "RdsSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Security Group for RDS",
    });
    cdk.Tags.of(rdsSecurityGruop).add("Name", "sg-rds");
    rdsSecurityGruop.addIngressRule(
      instanceSecurityGroup,
      ec2.Port.POSTGRES,
      "Postgres"
    );

    this.vpc = vpc;
    this.instanceSecurityGroup = instanceSecurityGroup;
    this.rdsSecurityGroup = rdsSecurityGruop;
  }
}
