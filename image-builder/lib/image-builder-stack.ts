import * as fs from "fs";
import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as imageBuilder from "aws-cdk-lib/aws-imagebuilder";

export class ImageBuilderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const region = cdk.Stack.of(this).region;
    const accountId = cdk.Stack.of(this).account;

    // VPC
    const vpc = new ec2.Vpc(this, "vpc", {
      maxAzs: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      ],
    });

    // Image Builder - Image Recipe
    const nginxComponent = new imageBuilder.CfnComponent(
      this,
      "nginx-component",
      {
        name: "nginx",
        platform: "Linux",
        version: "1.0.0",
        data: fs.readFileSync(
          path.resolve(__dirname, "./install-nginx.yml"),
          "utf-8"
        ),
      }
    );
    const cloudWatchAgentComponent = new imageBuilder.CfnComponent(
      this,
      "create-cloudwatch-agent-configuration",
      {
        name: "create-cloudwatch-agent-configuration",
        platform: "Linux",
        version: "1.0.0",
        data: fs.readFileSync(
          path.resolve(
            __dirname,
            "./create-cloudwatch-agent-configuration.yml"
          ),
          "utf-8"
        ),
      }
    );
    const imageRecipe = new imageBuilder.CfnImageRecipe(this, "image-recipe", {
      name: "my-al2023-recipe",
      version: "1.0.1",
      // https://ap-northeast-2.console.aws.amazon.com/imagebuilder/home?region=ap-northeast-2#/images?tab=amazon-managed&region=ap-northeast-2 에서 확인
      // x.x.x -> 사용 가능한 최신 버전 사용
      parentImage:
        "arn:aws:imagebuilder:ap-northeast-2:aws:image/amazon-linux-2023-x86/x.x.x",
      // https://ap-northeast-2.console.aws.amazon.com/imagebuilder/home?region=ap-northeast-2#/components?region=ap-northeast-2&owner=Amazon 에서 확인
      // 또는 직접 만들고 arn 연결
      components: [
        {
          componentArn: `arn:aws:imagebuilder:${region}:aws:component/amazon-cloudwatch-agent-linux/1.0.1/1`,
        },
        {
          componentArn: `arn:aws:imagebuilder:${region}:aws:component/aws-codedeploy-agent-linux/1.1.1/1`,
        },
        {
          componentArn: `arn:aws:imagebuilder:${region}:aws:component/aws-cli-version-2-linux/1.0.4/1`,
        },
        {
          componentArn: nginxComponent.attrArn,
        },
        {
          componentArn: cloudWatchAgentComponent.attrArn,
        },
      ],
      // 지정하지 않으면 기본 스토리지 사용
      // 기본 스토리지 : 8 GB, gp2, no-encryption
      blockDeviceMappings: [
        {
          deviceName: "/dev/xvda",
          ebs: {
            volumeSize: 12,
            volumeType: "gp3",
            deleteOnTermination: true,
            encrypted: true,
          },
        },
      ],
    });

    // Image Builder - Infra Configuration
    const instanceSecurityGroup = new ec2.SecurityGroup(
      this,
      "image-builder-sg",
      {
        vpc,
        allowAllOutbound: true,
        description: "Security Group for Image Builder",
      }
    );
    const instanceRole = new iam.Role(this, "instance-role", {
      roleName: "image-builder-instance-role",
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "EC2InstanceProfileForImageBuilder"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "EC2InstanceProfileForImageBuilderECRContainerBuilds"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy"
        ),
      ],
    });
    const instanceProfile = new iam.CfnInstanceProfile(
      this,
      "instance-profile",
      {
        instanceProfileName: "image-builder-instance-profile",
        roles: [instanceRole.roleName],
      }
    );
    const infraConfig = new imageBuilder.CfnInfrastructureConfiguration(
      this,
      "infra-config",
      {
        name: "my-al2023-infra-config",
        subnetId: vpc.publicSubnets[0].subnetId,
        securityGroupIds: [instanceSecurityGroup.securityGroupId],
        instanceProfileName: instanceProfile.ref,
        instanceTypes: ["m4.large", "m5.large"],
        terminateInstanceOnFailure: true,
      }
    );

    const distributionConfig = new imageBuilder.CfnDistributionConfiguration(
      this,
      "distribution-config",
      {
        name: "my-al2023-distribution-config",
        distributions: [
          {
            region,
            amiDistributionConfiguration: {
              name: "my-al2023-{{ imagebuilder:buildVersion }}-{{ imagebuilder:buildDate }}",
              kmsKeyId: `arn:aws:kms:${region}:${accountId}:alias/aws/ebs`,
              targetAccountIds: [accountId],
            },
          },
        ],
      }
    );

    const pipeline = new imageBuilder.CfnImagePipeline(this, "image-pipeline", {
      name: "my-al2023-pipeline",
      imageRecipeArn: imageRecipe.attrArn,
      infrastructureConfigurationArn: infraConfig.attrArn,
      distributionConfigurationArn: distributionConfig.attrArn,
      status: "ENABLED",
      imageTestsConfiguration: {
        imageTestsEnabled: false,
        timeoutMinutes: 90,
      },
    });
  }
}
