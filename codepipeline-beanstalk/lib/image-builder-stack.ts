import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as imageBuilder from "aws-cdk-lib/aws-imagebuilder";

export interface ImageBuilderStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class ImageBuilderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ImageBuilderStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;
    const prefix = "myproject-app-eb-al2023";

    // Image Recipe
    const imageRecipe = new imageBuilder.CfnImageRecipe(this, "ImageRecipe", {
      name: `${prefix}-recipe`,
      version: "1.0.1",
      parentImage:
        "arn:aws:imagebuilder:ap-northeast-2:aws:image/amazon-linux-2023-x86/x.x.x",
      components: [
        {
          componentArn: `arn:aws:imagebuilder:${region}:aws:component/amazon-cloudwatch-agent-linux/1.0.1/1`,
        },
        {
          componentArn: `arn:aws:imagebuilder:${region}:aws:component/aws-cli-version-2-linux/1.0.4/1`,
        },
      ],
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

    // Infrastructure Configuration
    const instanceSecurityGroup = new ec2.SecurityGroup(
      this,
      "InstanceSecurityGroup",
      {
        vpc,
        securityGroupName: `${prefix}-instance-sg`,
        allowAllOutbound: true,
        description: "Security Group for Image Builder",
      }
    );
    const instanceRole = new iam.Role(this, "InstanceRole", {
      roleName: `${prefix}-instance-role`,
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
      ],
    });
    const instanceProfile = new iam.CfnInstanceProfile(
      this,
      "InstanceProfile",
      {
        instanceProfileName: `${prefix}-instance-profile`,
        roles: [instanceRole.roleName],
      }
    );
    const infraConfig = new imageBuilder.CfnInfrastructureConfiguration(
      this,
      "InfraConfig",
      {
        name: `${prefix}-infra-config`,
        subnetId: vpc.publicSubnets[0].subnetId,
        securityGroupIds: [instanceSecurityGroup.securityGroupId],
        instanceProfileName: instanceProfile.ref,
        instanceTypes: ["m5.large"],
        terminateInstanceOnFailure: true,
      }
    );

    // Distribution Configuration
    const distConfig = new imageBuilder.CfnDistributionConfiguration(
      this,
      "DistConfig",
      {
        name: `${prefix}-dist-config`,
        distributions: [
          {
            region,
            amiDistributionConfiguration: {
              name: `${prefix}-{{ imagebuilder:buildVersion }}-{{ imagebuilder:buildDate }}`,
              kmsKeyId: `arn:aws:kms:${region}:${account}:alias/aws/ebs`,
              targetAccountIds: [account],
            },
          },
        ],
      }
    );

    // Image Pipeline
    const imagePipeline = new imageBuilder.CfnImagePipeline(
      this,
      "ImagePipeline",
      {
        name: `${prefix}-image-pipeline`,
        imageRecipeArn: imageRecipe.attrArn,
        infrastructureConfigurationArn: infraConfig.attrArn,
        distributionConfigurationArn: distConfig.attrArn,
        status: "ENABLED",
        imageTestsConfiguration: {
          imageTestsEnabled: false,
          timeoutMinutes: 90,
        },
      }
    );
  }
}
