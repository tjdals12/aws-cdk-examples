import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as logs from "aws-cdk-lib/aws-logs";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";

import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as firehose from "aws-cdk-lib/aws-kinesisfirehose";

export interface LogPipelineStackProps extends cdk.StackProps {
  project: string;
  stage: string;
}

export class LogPipelineStack extends cdk.Stack {
  readonly deliveryStreamArn: string;

  constructor(scope: Construct, id: string, props: LogPipelineStackProps) {
    super(scope, id, props);

    const { project, stage } = props;
    const projectStage = `${project}-${stage}`;

    const fnName = `${projectStage}-transform-event-log`;

    const fnLogGroup = new logs.LogGroup(this, "fn-log-group", {
      logGroupName: `/aws/lambda/${fnName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const fn = new lambdaNodejs.NodejsFunction(this, "fn", {
      functionName: fnName,
      entry: path.join(__dirname, "./lambda/transform-event-log.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      logGroup: fnLogGroup,
      loggingFormat: lambda.LoggingFormat.JSON,
      timeout: cdk.Duration.minutes(3),
    });

    const fnVersion = fn.currentVersion;

    const fnAlias = new lambda.Alias(this, "fn-alias", {
      aliasName: "live",
      version: fnVersion,
    });

    const dataLakeBucket = new s3.Bucket(this, "data-lake-bucket", {
      bucketName: `${projectStage}-data-lake`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          // 완료되지 않은 멀티 파트 업로드
          id: "abort-mpu-7d",
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          // 만료된 삭제 마커 정리 (삭제 마커가 있고, 이전 버전이 존재하지 않는 오브젝트)
          id: "cleanup-expired-delete-markers",
          expiredObjectDeleteMarker: true,
        },
      ],
    });

    const streamRole = new iam.Role(this, "stream-role", {
      roleName: `${projectStage}-stream-role`,
      assumedBy: new iam.ServicePrincipal("firehose.amazonaws.com"),
    });

    const streamLogGroup = new logs.LogGroup(this, "stream-log-group", {
      logGroupName: `/aws/firehose-stream/${projectStage}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const streamLogStream = streamLogGroup.addStream("stream-log-stream", {
      logStreamName: "event-log-stream",
    });

    const stream = new firehose.CfnDeliveryStream(this, "stream", {
      deliveryStreamName: `${projectStage}-event-log-stream`,
      extendedS3DestinationConfiguration: {
        bucketArn: dataLakeBucket.bucketArn,
        roleArn: streamRole.roleArn,
        prefix:
          "bronze/raw/events/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/",
        errorOutputPrefix:
          "errors/raw/events/!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/",
        bufferingHints: {
          intervalInSeconds: cdk.Duration.seconds(60).toSeconds(),
          sizeInMBs: cdk.Size.mebibytes(1).toMebibytes(),
        },
        compressionFormat: firehose.Compression.UNCOMPRESSED.value,
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: streamLogGroup.logGroupName,
          logStreamName: streamLogStream.logStreamName,
        },
        processingConfiguration: {
          enabled: true,
          processors: [
            {
              type: "Decompression",
              parameters: [
                {
                  parameterName: "CompressionFormat",
                  parameterValue: "GZIP",
                },
              ],
            },
            {
              type: "CloudWatchLogProcessing",
              parameters: [
                {
                  parameterName: "DataMessageExtraction",
                  parameterValue: "true",
                },
              ],
            },
            {
              type: "Lambda",
              parameters: [
                {
                  parameterName: "LambdaArn",
                  parameterValue: fnAlias.functionArn,
                },
              ],
            },
          ],
        },
      },
    });
    fnLogGroup.grantWrite(streamRole);
    fn.grantInvoke(streamRole);
    dataLakeBucket.grantWrite(streamRole);
    streamLogGroup.grantWrite(streamRole);

    this.deliveryStreamArn = stream.attrArn;
  }
}
