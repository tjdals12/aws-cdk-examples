import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";

export interface BastionHostStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class BastionHostStack extends cdk.Stack {
  readonly instanceSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: BastionHostStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    const sshIp = process.env.SSH_IP!;

    const instanceRole = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    const instanceSecurityGroup = new ec2.SecurityGroup(
      this,
      "InstanceSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
        description: "Security Group for Bastion Host",
      }
    );
    instanceSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(sshIp),
      ec2.Port.SSH,
      "Allow SSH"
    );

    const machineImage = ec2.MachineImage.latestAmazonLinux2023();

    const keyPair = ec2.KeyPair.fromKeyPairName(
      this,
      "InstanceKeyPair",
      "my-project-dev"
    );

    new ec2.Instance(this, "Instance", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      role: instanceRole,
      securityGroup: instanceSecurityGroup,
      machineImage,
      keyPair,
    });

    this.instanceSecurityGroup = instanceSecurityGroup;
  }
}
