import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as elasticbeanstalk from "aws-cdk-lib/aws-elasticbeanstalk";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";

export class BeanstalkRdsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Context
    const sshIp = this.node.tryGetContext("ssh-ip") ?? null;
    if (!sshIp) throw new Error("Please add sshIp");

    // VPC
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      ],
    });

    // Beanstalk
    const applicationSource = new s3Assets.Asset(this, "ApplicationSource", {
      path: path.resolve(__dirname, "../assets/app.zip"),
    });
    const ebApplication = new elasticbeanstalk.CfnApplication(
      this,
      "EBApplication",
      {
        applicationName: "my-project",
      }
    );
    const ebApplicationVersion = new elasticbeanstalk.CfnApplicationVersion(
      this,
      "EBApplicationVersion",
      {
        applicationName: ebApplication.applicationName!,
        sourceBundle: {
          s3Bucket: applicationSource.s3BucketName,
          s3Key: applicationSource.s3ObjectKey,
        },
      }
    );

    const instanceProfileRole = new iam.Role(this, "EBInstanceProfileRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AWSElasticBeanstalkWebTier"
        ),
      ],
    });

    const instanceProfile = new iam.CfnInstanceProfile(
      this,
      "EBInstanceProfile",
      {
        roles: [instanceProfileRole.roleName],
      }
    );

    const instanceSecurityGroup = new ec2.SecurityGroup(
      this,
      "InstanceSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
      }
    );

    const albSecurityGroup = new ec2.SecurityGroup(this, "EBALBSecurityGroup", {
      vpc,
      description: "Security Group for ALB",
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.HTTP, "HTTP");

    const ebEnvironment = new elasticbeanstalk.CfnEnvironment(
      this,
      "EBEnvironment",
      {
        environmentName: "my-project-env",
        applicationName: ebApplication.applicationName!,
        versionLabel: ebApplicationVersion.ref,
        solutionStackName: "64bit Amazon Linux 2023 v6.5.2 running Node.js 22",
        optionSettings: [
          // VPC
          {
            namespace: "aws:ec2:vpc",
            optionName: "VPCId",
            value: vpc.vpcId,
          },
          {
            namespace: "aws:ec2:vpc",
            optionName: "Subnets",
            value: vpc.privateSubnets
              .map((subnet) => subnet.subnetId)
              .join(","),
          },
          {
            namespace: "aws:ec2:vpc",
            optionName: "ELBSubnets",
            value: vpc.publicSubnets.map((subnet) => subnet.subnetId).join(","),
          },

          // Instance
          {
            namespace: "aws:autoscaling:launchconfiguration",
            optionName: "IamInstanceProfile",
            value: instanceProfile.ref,
          },
          {
            namespace: "aws:autoscaling:launchconfiguration",
            optionName: "InstanceType",
            value: "t2.micro",
          },
          {
            namespace: "aws:autoscaling:launchconfiguration",
            optionName: "SecurityGroups",
            value: instanceSecurityGroup.securityGroupId,
          },
          {
            namespace: "aws:autoscaling:launchconfiguration",
            optionName: "EC2KeyName",
            value: "my-project-dev",
          },
          // EC2 인스턴스의 보안 그룹에 SSH 인바운드 규칙을 추가 (이 값을 지정하지 않으면 SSH를 퍼블릭으로 설정함.)
          {
            namespace: "aws:autoscaling:launchconfiguration",
            optionName: "SSHSourceRestriction",
            value: `tcp, 22, 22, ${sshIp}`,
          },

          // Load Balancer
          {
            namespace: "aws:elasticbeanstalk:environment",
            optionName: "EnvironmentType",
            value: "LoadBalanced",
          },
          {
            namespace: "aws:autoscaling:asg",
            optionName: "MinSize",
            value: "1",
          },
          {
            namespace: "aws:autoscaling:asg",
            optionName: "MaxSize",
            value: "4",
          },
          // // Beanstalk이 자동으로 생성/관리하는 보안 그룹을 대체
          // {
          //   namespace: "aws:elb:loadbalancer",
          //   optionName: "ManagedSecurityGroup",
          //   value: albSecurityGroup.securityGroupId,
          // },
          // // 사용자 지정 보안 그룹 추가
          // // Beanstalk이 자동으로 생성하는 보안 그룹을 대체한 경우, 이 값을 지정하지 않으면 VPC의 기본 보안그룹이 추가됨.
          // {
          //   namespace: "aws:elb:loadbalancer",
          //   optionName: "SecurityGroups",
          //   value: albSecurityGroup.securityGroupId,
          // },
          {
            namespace: "aws:elb:listener",
            optionName: "ListenerProtocol",
            value: "HTTP",
          },
          {
            namespace: "aws:elb:loadbalancer",
            optionName: "LoadBalancerHTTPPort",
            value: "80",
          },
          {
            namespace: "aws:elb:listener",
            optionName: "InstanceProtocol",
            value: "HTTP",
          },
          {
            namespace: "aws:elb:listener",
            optionName: "InstancePort",
            value: "80",
          },

          // Env
          {
            namespace: "aws:elasticbeanstalk:application:environment",
            optionName: "PORT",
            value: "8080",
          },
        ],
      }
    );

    ebApplicationVersion.addDependency(ebApplication);
    ebEnvironment.addDependency(ebApplicationVersion);

    // RDS
    const rdsSecurityGroup = new ec2.SecurityGroup(this, "RdsSecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });
    rdsSecurityGroup.addIngressRule(
      instanceSecurityGroup,
      ec2.Port.POSTGRES,
      "Postgres"
    );

    new rds.DatabaseInstance(this, "RdsInstance", {
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
  }
}
