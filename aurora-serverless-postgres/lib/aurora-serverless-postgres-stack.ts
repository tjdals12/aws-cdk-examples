import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";

export interface AuroraServerlessPostgresStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  bastionHostSecurityGroup: ec2.SecurityGroup;
}

export class AuroraServerlessPostgresStack extends cdk.Stack {
  readonly rdsSecurityGroup: ec2.SecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    props: AuroraServerlessPostgresStackProps
  ) {
    super(scope, id, props);

    const { vpc, bastionHostSecurityGroup } = props;

    const rdsSecurityGroup = new ec2.SecurityGroup(this, "RDSSecurityGroup", {
      vpc,
      description: "Allow PostgreSQL from my IP",
      allowAllOutbound: true,
    });
    rdsSecurityGroup.addIngressRule(
      bastionHostSecurityGroup,
      ec2.Port.POSTGRES,
      "Allow Postgres from Instance"
    );

    const rdsSubnetGroup = new rds.SubnetGroup(this, "RDSSubnetGroup", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      description: "RDS private subnet group",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const cluster = new rds.DatabaseCluster(this, "AuroraCluster", {
      vpc,
      subnetGroup: rdsSubnetGroup,
      securityGroups: [rdsSecurityGroup],
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      credentials: rds.Credentials.fromGeneratedSecret("postgres"),
      storageEncrypted: true,
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      defaultDatabaseName: "mydatabase",
      writer: rds.ClusterInstance.serverlessV2(`my-database-writer`),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 로컬에서 연결하려면 아래와 같이 publicAccessible을 활성화하고, 서브넷 그룹에 퍼블릭 서브넷을 할당한다.
    // const writerInstance = cluster.node.findChild("my-database-writer").node
    //   .defaultChild as rds.CfnDBInstance;
    // writerInstance.publiclyAccessible = true;

    this.rdsSecurityGroup = rdsSecurityGroup;
  }
}
