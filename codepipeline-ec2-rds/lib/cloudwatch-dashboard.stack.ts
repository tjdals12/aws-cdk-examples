import * as fs from "fs";
import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscription from "aws-cdk-lib/aws-sns-subscriptions";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";

interface CloudWatchDashboardStackProps extends cdk.StackProps {
  project: string;
  emails: string[];
  slackWebhookUrl: string;
  ec2Instance: ec2.IInstance;
}

export class CloudWatchDashboardStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: CloudWatchDashboardStackProps
  ) {
    super(scope, id, props);

    const { project, emails, slackWebhookUrl, ec2Instance } = props;
    const instanceId = ec2Instance.instanceId;

    const slackNotificationFunction = new lambdaNodejs.NodejsFunction(
      this,
      "slack-notification-function",
      {
        functionName: `${project}-send-to-slack`,
        entry: path.join(__dirname, "./lambda/send-to-slack.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: {
          SLACK_WEBHOOK_URL: slackWebhookUrl,
        },
      }
    );

    const alarmTopic = new sns.Topic(this, "AlarmTopic", {
      displayName: `${project}-alarm-topic`,
    });
    emails.forEach((email) => {
      alarmTopic.addSubscription(new snsSubscription.EmailSubscription(email));
    });
    alarmTopic.addSubscription(
      new snsSubscription.LambdaSubscription(slackNotificationFunction)
    );

    const dashboard = new cloudwatch.Dashboard(this, "cloudwatch-dashboard", {
      dashboardName: `${project}-dashboard`,
    });

    const cpuMetric = new cloudwatch.Metric({
      namespace: "AWS/EC2",
      metricName: "CPUUtilization",
      dimensionsMap: {
        InstanceId: instanceId,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(1),
    });
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: "CPU Usage (%)",
        metrics: [cpuMetric],
        width: 6,
        height: 6,
        setPeriodToTimeRange: true,
        sparkline: false,
      }),
      new cloudwatch.GraphWidget({
        title: "CPU Utilization (%)",
        left: [cpuMetric],
        width: 12,
      })
    );

    const cpuAlarm = new cloudwatch.Alarm(this, "high-cpu-alarm", {
      alarmName: "EC2 CPU usage exceeds 30%",
      alarmDescription: "EC2 CPU usage exceeds 30%",
      metric: cpuMetric,
      threshold: 30,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    cpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    const memMetric = new cloudwatch.Metric({
      namespace: "CWAgent",
      metricName: "mem_used_percent",
      dimensionsMap: {
        InstanceId: instanceId,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(1),
    });
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: "Memory Usage (%)",
        metrics: [memMetric],
        width: 6,
        height: 6,
        setPeriodToTimeRange: true,
        sparkline: false,
      }),
      new cloudwatch.GraphWidget({
        title: "Memory Usage (%)",
        left: [cpuMetric],
        width: 12,
      })
    );

    const memAlarm = new cloudwatch.Alarm(this, "high-memory-alarm", {
      alarmName: "EC2 Memory usage exceeds 60%",
      alarmDescription: "EC2 Memory usage exceeds 60%",
      metric: memMetric,
      threshold: 60,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    memAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    const diskMetric = new cloudwatch.Metric({
      namespace: "CWAgent",
      metricName: "disk_used_percent",
      dimensionsMap: {
        InstanceId: instanceId,
        path: "/",
        device: "nvme0n1p1",
        fstype: "xfs",
      },
      statistic: "Average",
      period: cdk.Duration.minutes(1),
    });
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: "Disk Usage (%)",
        metrics: [diskMetric],
        width: 6,
        height: 6,
        setPeriodToTimeRange: true,
        sparkline: false,
      }),
      new cloudwatch.GraphWidget({
        title: "Disk Usage (%)",
        left: [diskMetric],
        width: 12,
      })
    );

    const diskAlarm = new cloudwatch.Alarm(this, "high-disk-usage-alarm", {
      alarmName: "EC2 Disk usage exceeds 80%",
      alarmDescription: "EC2 Disk usage exceeds 80%",
      metric: diskMetric,
      threshold: 80,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    diskAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));
  }
}
