import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

interface RdsStackProps extends cdk.StackProps {
  project: string;
  vpc: ec2.IVpc;
  securityGroup: ec2.ISecurityGroup;
}

export class RdsStack extends cdk.Stack {
  readonly secret: secretsmanager.ISecret;
  readonly instance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    const { project, vpc, securityGroup } = props;

    const subnetGroup = new rds.SubnetGroup(this, "rds-subnet-group", {
      subnetGroupName: `${project}-rds-subnet-group`,
      description: "Subnet Group for RDS",
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const instanceType = ec2.InstanceType.of(
      ec2.InstanceClass.T3,
      ec2.InstanceSize.MICRO
    );

    const engine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.VER_16_9,
    });

    const credentials = rds.Credentials.fromGeneratedSecret("postgres");

    const rdsInstance = new rds.DatabaseInstance(this, "rds-instance", {
      instanceIdentifier: `${project}-rds`,
      vpc,
      subnetGroup,
      instanceType,
      engine,
      credentials,
      multiAz: false,
      allocatedStorage: 10,
      maxAllocatedStorage: 100,
      publiclyAccessible: false,
      securityGroups: [securityGroup],
    });

    this.secret = rdsInstance.secret!;
    this.instance = rdsInstance;
  }
}
