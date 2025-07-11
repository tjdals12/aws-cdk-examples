import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dms from "aws-cdk-lib/aws-dms";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";

export interface DmsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  sourceDatabaseSecretArn: string;
  sourceDatabaseSecurityGroupId: string;
  targetDatabaseSecretArn: string;
  targetDatabaseSecurityGroupId: string;
}

export class DmsStack extends cdk.Stack {
  readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DmsStackProps) {
    super(scope, id, props);

    const {
      vpc,
      sourceDatabaseSecretArn,
      sourceDatabaseSecurityGroupId,
      targetDatabaseSecretArn,
      targetDatabaseSecurityGroupId,
    } = props;

    const replicationInstanceSecurityGroup = new ec2.SecurityGroup(
      this,
      "ReplicationInstanceSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
        description: "Security Group for Replication Instance",
      }
    );
    const sourceDatabaseSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "SourceDatabaseSecurityGroup",
      sourceDatabaseSecurityGroupId
    );
    sourceDatabaseSecurityGroup.addIngressRule(
      replicationInstanceSecurityGroup,
      ec2.Port.POSTGRES,
      "Allow Postgres from Replication Instance"
    );
    const targetDatabaseSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "TargetDatabaseSecurityGroup",
      targetDatabaseSecurityGroupId
    );
    targetDatabaseSecurityGroup.addIngressRule(
      replicationInstanceSecurityGroup,
      ec2.Port.POSTGRES,
      "Allow Postgres from Replication Instance"
    );

    const replicationSubnetGroup = new dms.CfnReplicationSubnetGroup(
      this,
      "ReplicationSubnetGroup",
      {
        subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
        replicationSubnetGroupIdentifier: "dms-replication-subnet-group",
        replicationSubnetGroupDescription:
          "Subnet Group for Replication Instance",
      }
    );

    const dmsVpcRole = new iam.Role(this, "DmsVpcRole", {
      roleName: "dms-vpc-role",
      assumedBy: new iam.ServicePrincipal("dms.amazonaws.com"),
    });
    dmsVpcRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonDMSVPCManagementRole"
      )
    );

    const dmsCloudWatchLogsRole = new iam.Role(this, "DmsCloudWatchLogsRole", {
      roleName: "dms-cloudwatch-logs-role",
      assumedBy: new iam.ServicePrincipal("dms.amazonaws.com"),
    });
    dmsCloudWatchLogsRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonDMSCloudWatchLogsRole"
      )
    );

    replicationSubnetGroup.node.addDependency(dmsVpcRole);
    replicationSubnetGroup.node.addDependency(dmsCloudWatchLogsRole);

    const replicationInstance = new dms.CfnReplicationInstance(
      this,
      "ReplicationInstance",
      {
        replicationInstanceIdentifier: "dms-replication-instance",
        replicationInstanceClass: "dms.t3.micro",
        allocatedStorage: 50,
        replicationSubnetGroupIdentifier: replicationSubnetGroup.ref,
        vpcSecurityGroupIds: [replicationInstanceSecurityGroup.securityGroupId],
      }
    );

    const secretAccessRole = new iam.Role(this, "SecretAccessRole", {
      assumedBy: new iam.ServicePrincipal("dms.ap-northeast-2.amazonaws.com"),
    });
    secretAccessRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ],
        resources: [sourceDatabaseSecretArn, targetDatabaseSecretArn],
      })
    );

    const sourceEndpoint = new dms.CfnEndpoint(this, "SourceEndpoint", {
      endpointIdentifier: "dms-source-endpoint",
      endpointType: "source",
      engineName: "postgres",
      databaseName: "public",
      sslMode: "require",
      postgreSqlSettings: {
        secretsManagerAccessRoleArn: secretAccessRole.roleArn,
        secretsManagerSecretId: sourceDatabaseSecretArn,
      },
    });
    const targetEndpoint = new dms.CfnEndpoint(this, "TargetEndpoint", {
      endpointIdentifier: "dms-target-endpoint",
      endpointType: "target",
      engineName: "postgres",
      databaseName: "mydatabase",
      sslMode: "require",
      postgreSqlSettings: {
        secretsManagerAccessRoleArn: secretAccessRole.roleArn,
        secretsManagerSecretId: targetDatabaseSecretArn,
      },
    });

    const replicationTask = new dms.CfnReplicationTask(
      this,
      "ReplicationTask",
      {
        replicationTaskIdentifier: "dms-replication-task",
        replicationInstanceArn: replicationInstance.ref,
        sourceEndpointArn: sourceEndpoint.ref,
        targetEndpointArn: targetEndpoint.ref,
        migrationType: "full-load-and-cdc",
        tableMappings: JSON.stringify({
          // https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.CustomizingTasks.TableMapping.Console.html
          rules: [
            {
              "rule-type": "selection",
              "rule-id": "1",
              "rule-name": "1",
              "object-locator": {
                "schema-name": "public",
                "table-name": "%",
              },
              "rule-action": "include",
            },
          ],
        }),
        // https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.CustomizingTasks.TaskSettings.html
        replicationTaskSettings: JSON.stringify({
          // https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.CustomizingTasks.TaskSettings.TargetMetadata.html
          TargetMetadata: {
            TargetSchema: "",
            SupportLobs: true,
            FullLobMode: true,
            LobChunkSize: 64,
            LobMaxSize: 32,
          },
          // https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.CustomizingTasks.TaskSettings.FullLoad.html
          FullLoadSettings: {
            TargetTablePrepMode: "DROP_AND_CREATE",
          },
          // https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.CustomizingTasks.TaskSettings.DataValidation.html
          ValidationSettings: {
            EnableValidation: true,
          },
          // https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.CustomizingTasks.TaskSettings.Logging.html
          Logging: {
            EnableLogging: true,
          },
        }),
      }
    );

    const preassessmentReportBucket = new s3.Bucket(
      this,
      "DmsPreassessmentReportBucket",
      {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        lifecycleRules: [
          {
            expiration: cdk.Duration.days(7),
          },
        ],
      }
    );
    const preassessmentReportBucketAccessRole = new iam.Role(
      this,
      "DmsPreassessmentReportBucketAccessRole",
      {
        assumedBy: new iam.ServicePrincipal("dms.ap-northeast-2.amazonaws.com"),
      }
    );
    preassessmentReportBucketAccessRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:GetBucketLocation",
        ],
        resources: [
          preassessmentReportBucket.bucketArn,
          `${preassessmentReportBucket.bucketArn}/*`,
        ],
      })
    );
  }
}
