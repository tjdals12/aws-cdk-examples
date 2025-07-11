import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export interface RdsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class RdsStack extends cdk.Stack {
  readonly secret: secretsmanager.ISecret;
  readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    const instanceSecurityGroup = new ec2.SecurityGroup(
      this,
      "InstanceSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
        description: "Security Group for RDS Instance",
      }
    );

    const subnetGroup = new rds.SubnetGroup(this, "RdsSubnetGroup", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      description: "RDS subnet group",
    });

    const instance = new rds.DatabaseInstance(this, "RdsIntance", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_6,
      }),
      credentials: rds.Credentials.fromGeneratedSecret("postgres"),
      multiAz: false,
      allocatedStorage: 10,
      maxAllocatedStorage: 50,
      publiclyAccessible: false,
      securityGroups: [instanceSecurityGroup],
      subnetGroup,
      parameters: {
        "rds.logical_replication": "1",
        session_replication_role: "replica",
        shared_preload_libraries: "pg_stat_statements,pg_tle,pglogical",
      },
    });

    this.secret = instance.secret!;
    this.securityGroup = instanceSecurityGroup;
  }
}
