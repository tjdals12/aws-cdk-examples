import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as logs from "aws-cdk-lib/aws-logs";
import * as logsDestinations from "aws-cdk-lib/aws-logs-destinations";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as firehose from "aws-cdk-lib/aws-kinesisfirehose";

export interface LogIngestStackProps extends cdk.StackProps {
  project: string;
  stage: string;
  deliveryStreamArn: string;
}

export class LogIngestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LogIngestStackProps) {
    super(scope, id, props);

    const { project, stage, deliveryStreamArn } = props;
    const projectStage = `${project}-${stage}`;

    const fnName = `${projectStage}-record-event-log`;

    const fnLogGroup = new logs.LogGroup(this, "lambda-fn-log-group", {
      logGroupName: `/aws/lambda/${fnName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const fn = new lambdaNodejs.NodejsFunction(this, "lambda-fn", {
      functionName: fnName,
      entry: path.join(__dirname, "./lambda/record-event-log.ts"),
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

    const httpApiName = `${projectStage}-http-api`;

    const httpApi = new apigwv2.HttpApi(this, "http-api", {
      apiName: httpApiName,
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: ["*"],
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: [
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
      },
    });
    httpApi.addRoutes({
      path: "/events",
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2Integrations.HttpLambdaIntegration(
        "record-event-log-integration",
        fnAlias,
        {
          payloadFormatVersion: apigwv2.PayloadFormatVersion.VERSION_2_0,
        }
      ),
    });

    const gwLogGroup = new logs.LogGroup(this, "apigw-log-group", {
      logGroupName: `/aws/apigwv2/${httpApiName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new apigwv2.HttpStage(this, "http-stage", {
      httpApi,
      stageName: stage,
      autoDeploy: true,
      accessLogSettings: {
        destination: new apigwv2.LogGroupLogDestination(gwLogGroup),
        format: apigw.AccessLogFormat.custom(
          JSON.stringify({
            requestId: apigw.AccessLogField.contextRequestId(),
            sourceIp: apigw.AccessLogField.contextIdentitySourceIp(),
            method: apigw.AccessLogField.contextHttpMethod(),
            path: apigw.AccessLogField.contextPath(),
            status: apigw.AccessLogField.contextStatus(),
          })
        ),
      },
    });

    new logs.SubscriptionFilter(this, "subscription-filter", {
      logGroup: fnLogGroup,
      destination: new logsDestinations.FirehoseDestination(
        firehose.DeliveryStream.fromDeliveryStreamArn(
          this,
          "delivery-stream-ref",
          deliveryStreamArn
        )
      ),
      filterPattern: logs.FilterPattern.stringValue(
        "$.message.kind",
        "=",
        "app_event"
      ),
    });
  }
}
