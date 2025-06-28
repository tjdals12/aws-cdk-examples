import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";

export interface RdsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  rdsSecurityGroup: ec2.SecurityGroup;
}

export class RdsStack extends cdk.Stack {
  readonly rdsInstance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    const vpc = props.vpc;
    const rdsSecurityGroup = props.rdsSecurityGroup;

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

    this.rdsInstance = rdsInstance;
  }
}
