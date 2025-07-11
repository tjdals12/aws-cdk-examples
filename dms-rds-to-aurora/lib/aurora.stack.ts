import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export interface AuroraStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class AuroraStack extends cdk.Stack {
  readonly secret: secretsmanager.ISecret;
  readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: AuroraStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    const instanceSecurityGroup = new ec2.SecurityGroup(
      this,
      "InstanceSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
        description: "Security Group for Aurora Instance",
      }
    );

    const subnetGroup = new rds.SubnetGroup(this, "RdsSubnetGroup", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      description: "Subnet Group for Aurora",
    });

    const credentials = rds.Credentials.fromGeneratedSecret("postgres");

    const cluster = new rds.DatabaseCluster(this, "AuroraCluster", {
      vpc,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      storageEncrypted: true,
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      defaultDatabaseName: "mydatabase",
      writer: rds.ClusterInstance.serverlessV2("writer-instance"),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      parameters: {
        "rds.logical_replication": "1",
        session_replication_role: "replica",
        shared_preload_libraries: "pg_stat_statements,pg_tle,pglogical",
      },
      securityGroups: [instanceSecurityGroup],
      subnetGroup,
      credentials: rds.Credentials.fromGeneratedSecret("postgres"),
    });

    this.secret = cluster.secret!;
    this.securityGroup = instanceSecurityGroup;
  }
}
