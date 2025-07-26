import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export interface RdsStackProps extends cdk.StackProps {
  projectPrefix: string;
  vpc: ec2.Vpc;
  instanceSecurityGroup: ec2.SecurityGroup;
}

export class RdsStack extends cdk.Stack {
  readonly secret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    const { projectPrefix, vpc, instanceSecurityGroup } = props;

    const subnetGroup = new rds.SubnetGroup(this, "rdsSubnetGroup", {
      subnetGroupName: `${projectPrefix}-rdsSubnetGroup`,
      description: "Subnet group for RDS",
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
      version: rds.PostgresEngineVersion.VER_16_8,
    });

    const credentials = rds.Credentials.fromGeneratedSecret("postgres");

    const instance = new rds.DatabaseInstance(this, "rdsInstance", {
      instanceIdentifier: `${projectPrefix}-rdsInstance`,
      vpc,
      subnetGroup,
      instanceType,
      engine,
      credentials,
      securityGroups: [instanceSecurityGroup],
      multiAz: false,
      allocatedStorage: 10,
      maxAllocatedStorage: 50,
      publiclyAccessible: false,
    });

    this.secret = instance.secret!;
  }
}
