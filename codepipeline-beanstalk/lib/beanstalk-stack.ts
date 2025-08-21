import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as elasticbeanstalk from "aws-cdk-lib/aws-elasticbeanstalk";
import * as iam from "aws-cdk-lib/aws-iam";
import * as customResources from "aws-cdk-lib/custom-resources";

export interface BeanstalkStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  instanceSecurityGroup: ec2.SecurityGroup;
  rdsSecretName: string;
}

export class BeanstalkStack extends cdk.Stack {
  readonly loadBalancerName: string;
  readonly autoScalingGroupName: string;

  constructor(scope: Construct, id: string, props: BeanstalkStackProps) {
    super(scope, id, props);

    const sshIp = process.env.SSH_IP;
    if (!sshIp) throw new Error("Please add SSH_IP");

    const vpc = props.vpc;
    const instanceSecurityGroup = props.instanceSecurityGroup;
    const rdsSecretName = props.rdsSecretName;

    // Beanstalk
    const applicationSource = new s3Assets.Asset(this, "ApplicationSource", {
      path: path.resolve(__dirname, "../assets/app.zip"),
    });
    const ebApplication = new elasticbeanstalk.CfnApplication(
      this,
      "EBApplication",
      {
        applicationName: "myproject",
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
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy"
        ),
      ],
    });
    instanceProfileRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${rdsSecretName}*`,
        ],
      })
    );

    const instanceProfile = new iam.CfnInstanceProfile(
      this,
      "EBInstanceProfile",
      {
        roles: [instanceProfileRole.roleName],
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
        environmentName: "myproject-env",
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
            optionName: "ImageId",
            value: "ami-0f24a0f662ecc7149",
          },
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
            value: "myproject-dev-key-pair",
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

          // Classic Load Balancer를 사용할 경우
          // {
          //   namespace: "aws:elb:listener",
          //   optionName: "ListenerProtocol",
          //   value: "HTTP",
          // },
          // {
          //   namespace: "aws:elb:loadbalancer",
          //   optionName: "LoadBalancerHTTPPort",
          //   value: "80",
          // },
          // {
          //   namespace: "aws:elb:listener",
          //   optionName: "InstanceProtocol",
          //   value: "HTTP",
          // },
          // {
          //   namespace: "aws:elb:listener",
          //   optionName: "InstancePort",
          //   value: "80",
          // },

          // Application Load Balancer를 사용할 경우
          {
            namespace: "aws:elasticbeanstalk:environment",
            optionName: "LoadBalancerType",
            value: "application",
          },
          {
            namespace: "aws:elbv2:listener:default",
            optionName: "ListenerEnabled",
            value: "true",
          },
          {
            namespace: "aws:elbv2:listener:default",
            optionName: "Protocol",
            value: "HTTP",
          },
          {
            namespace: "aws:elbv2:listener:default",
            optionName: "DefaultProcess",
            value: "default",
          },
          {
            namespace: "aws:elasticbeanstalk:environment:process:default",
            optionName: "Port",
            value: "80",
          },
          {
            namespace: "aws:elasticbeanstalk:environment:process:default",
            optionName: "Protocol",
            value: "HTTP",
          },
          {
            namespace: "aws:elasticbeanstalk:environment:process:default",
            optionName: "HealthCheckPath",
            value: "/",
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

          // Logs
          {
            namespace: "aws:elasticbeanstalk:cloudwatch:logs",
            optionName: "StreamLogs",
            value: "true",
          },
          {
            namespace: "aws:elasticbeanstalk:cloudwatch:logs",
            optionName: "RetentionInDays",
            value: "7",
          },
          {
            namespace: "aws:elasticbeanstalk:cloudwatch:logs",
            optionName: "DeleteOnTerminate",
            value: "false",
          },

          // Env
          {
            namespace: "aws:elasticbeanstalk:application:environment",
            optionName: "PORT",
            value: "8080",
          },
          {
            namespace: "aws:elasticbeanstalk:application:environment",
            optionName: "DB_SECRET_NAME",
            value: rdsSecretName,
          },
        ],
      }
    );

    ebApplicationVersion.addDependency(ebApplication);
    ebEnvironment.addDependency(ebApplicationVersion);

    const customResourcesRole = new iam.Role(this, "CustomResourceRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName("ReadOnlyAccess"),
      ],
    });
    const environmentResources = new customResources.AwsCustomResource(
      this,
      "ElasticElbName",
      {
        role: customResourcesRole,
        onCreate: {
          service: "ElasticBeanstalk",
          action: "DescribeEnvironmentResources",
          parameters: { EnvironmentName: "myproject-env" },
          physicalResourceId:
            customResources.PhysicalResourceId.of("EbClassicElbName"),
        },
        onUpdate: {
          service: "ElasticBeanstalk",
          action: "DescribeEnvironmentResources",
          parameters: { EnvironmentName: "myproject-env" },
          physicalResourceId:
            customResources.PhysicalResourceId.of("EbClassicElbName"),
        },
        policy: customResources.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: [
              "elasticbeanstalk:DescribeEnvironmentResources",
              "autoscaling:DescribeAutoScalingGroups",
            ],
            resources: ["*"],
          }),
        ]),
      }
    );

    environmentResources.node.addDependency(ebEnvironment);

    const loadBalancerName = cdk.Fn.select(
      1,
      cdk.Fn.split(
        "loadbalancer/",
        environmentResources.getResponseField(
          "EnvironmentResources.LoadBalancers.0.Name"
        )
      )
    );
    const autoScalingGroupName = environmentResources.getResponseField(
      "EnvironmentResources.AutoScalingGroups.0.Name"
    );

    this.loadBalancerName = loadBalancerName;
    this.autoScalingGroupName = autoScalingGroupName;
  }
}
