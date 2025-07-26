import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";

export interface BastionHostStackProps extends cdk.StackProps {
  projectPrefix: string;
  vpc: ec2.Vpc;
  instanceSecurityGroup: ec2.SecurityGroup;
}

export class BastionHostStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BastionHostStackProps) {
    super(scope, id, props);

    const { projectPrefix, vpc, instanceSecurityGroup } = props;

    const role = new iam.Role(this, "role", {
      roleName: `${projectPrefix}-bastionHostRole`,
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    const instanceType = ec2.InstanceType.of(
      ec2.InstanceClass.T3,
      ec2.InstanceSize.MICRO
    );

    const machineImage = ec2.MachineImage.latestAmazonLinux2023();

    const keyPair = ec2.KeyPair.fromKeyPairName(
      this,
      "keyPair",
      "my-project-dev"
    );

    const instance = new ec2.Instance(this, `instance`, {
      instanceName: `${projectPrefix}-bastionHostInstance`,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType,
      machineImage,
      role,
      securityGroup: instanceSecurityGroup,
      keyPair,
    });
  }
}
