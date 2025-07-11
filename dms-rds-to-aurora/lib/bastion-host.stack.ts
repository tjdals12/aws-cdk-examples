import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs/lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";

export interface BastionHostStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  sshIp: string;
  sourceDatabaseSecurityGroupId: string;
  targetDatabaseSecurityGroupId: string;
}

export class BastionHostStack extends cdk.Stack {
  readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: BastionHostStackProps) {
    super(scope, id, props);

    const {
      vpc,
      sshIp,
      sourceDatabaseSecurityGroupId,
      targetDatabaseSecurityGroupId,
    } = props;

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
      "Allow SSH from local"
    );
    const sourceDatabaseSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "SourceDatabaseSecurityGroup",
      sourceDatabaseSecurityGroupId
    );
    sourceDatabaseSecurityGroup.addIngressRule(
      instanceSecurityGroup,
      ec2.Port.POSTGRES,
      "Allow Postgres from Bastion Host"
    );
    const targetDatabaseSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "TargetDatabaseSecurityGroup",
      targetDatabaseSecurityGroupId
    );
    targetDatabaseSecurityGroup.addIngressRule(
      instanceSecurityGroup,
      ec2.Port.POSTGRES,
      "Allow Postgres from Bastion Host"
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
        ec2.InstanceSize.MICRO
      ),
      machineImage,
      role: instanceRole,
      securityGroup: instanceSecurityGroup,
      keyPair,
    });

    this.securityGroup = instanceSecurityGroup;
  }
}
