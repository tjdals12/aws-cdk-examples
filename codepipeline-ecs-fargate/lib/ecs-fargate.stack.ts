import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

export interface EcsFargateStackProps extends cdk.StackProps {
  projectPrefix: string;
  vpc: ec2.Vpc;
  appRepository: ecr.IRepository;
  rdsSecret: secretsmanager.ISecret;
  fargateServiceSecurityGroup: ec2.SecurityGroup;
  albSecurityGroup: ec2.SecurityGroup;
}

export class EcsFargateStack extends cdk.Stack {
  readonly fargateService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: EcsFargateStackProps) {
    super(scope, id, props);

    const {
      projectPrefix,
      vpc,
      appRepository,
      rdsSecret,
      fargateServiceSecurityGroup,
      albSecurityGroup,
    } = props;

    const cluster = new ecs.Cluster(this, "cluster", {
      clusterName: `${projectPrefix}-cluster`,
      vpc,
    });

    const executionRole = new iam.Role(this, "executionRole", {
      roleName: `${projectPrefix}-ecsExecutionRole`,
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    const taskRole = new iam.Role(this, "taskRole", {
      roleName: `${projectPrefix}-ecsTaskRole`,
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "fargateTaskDefinition",
      {
        family: `${projectPrefix}-taskDefinition`,
        cpu: 512,
        memoryLimitMiB: 1024,
        executionRole,
        taskRole,
      }
    );
    const containerLogGroup = new logs.LogGroup(this, "ContainerLogGroup", {
      logGroupName: `/${projectPrefix}/ecs/container`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    taskDefinition.addContainer("appContainer", {
      containerName: "app",
      image: ecs.ContainerImage.fromEcrRepository(appRepository, "latest"),
      portMappings: [
        {
          containerPort: 3000,
        },
      ],
      logging: ecs.LogDrivers.awsLogs({
        logGroup: containerLogGroup,
        streamPrefix: "app",
      }),
      secrets: {
        DB_USER: ecs.Secret.fromSecretsManager(rdsSecret, "username"),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(rdsSecret, "password"),
        DB_HOST: ecs.Secret.fromSecretsManager(rdsSecret, "host"),
        DB_PORT: ecs.Secret.fromSecretsManager(rdsSecret, "port"),
      },
    });

    const fargateService = new ecs.FargateService(this, "FargateService", {
      cluster,
      taskDefinition,
      securityGroups: [fargateServiceSecurityGroup],
      desiredCount: 2,
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    const loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      "loadBalancer",
      {
        loadBalancerName: `${projectPrefix}-alb`,
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PUBLIC,
        },
        securityGroup: albSecurityGroup,
        internetFacing: true,
      }
    );
    const listener = loadBalancer.addListener("httpListener", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      open: true,
    });
    listener.addTargets("httpTargets", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 3000,
      targets: [fargateService],
      healthCheck: {
        path: "/",
        interval: cdk.Duration.seconds(60),
        timeout: cdk.Duration.seconds(5),
      },
    });

    this.fargateService = fargateService;
  }
}
