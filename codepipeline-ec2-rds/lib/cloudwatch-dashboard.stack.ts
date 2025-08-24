import * as fs from "fs";
import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
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
  rdsInstance: rds.DatabaseInstance;
}

export class CloudWatchDashboardStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: CloudWatchDashboardStackProps
  ) {
    super(scope, id, props);

    const { project, emails, slackWebhookUrl, ec2Instance, rdsInstance } =
      props;
    const ec2InstanceId = ec2Instance.instanceId;
    const rdsInstanceIdentifier = rdsInstance.instanceIdentifier;

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

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: ["# EC2 Instance"].join("\n"),
        width: 24,
        height: 1,
        background: cloudwatch.TextWidgetBackground.TRANSPARENT,
      })
    );

    const ec2CpuMetric = new cloudwatch.Metric({
      namespace: "AWS/EC2",
      metricName: "CPUUtilization",
      dimensionsMap: {
        InstanceId: ec2InstanceId,
      },
      statistic: cloudwatch.Stats.AVERAGE,
      period: cdk.Duration.minutes(1),
    });
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: "CPU Usage (%)",
        metrics: [ec2CpuMetric],
        width: 6,
        height: 6,
        setPeriodToTimeRange: true,
        sparkline: false,
      }),
      new cloudwatch.GraphWidget({
        title: "CPU Utilization (%)",
        left: [ec2CpuMetric],
        width: 12,
        leftYAxis: {
          min: 0,
          max: 100,
        },
        leftAnnotations: [
          {
            value: 80,
            label: "Threshold",
            color: cloudwatch.Color.RED,
          },
        ],
      })
    );

    const ec2CpuAlarm = new cloudwatch.Alarm(this, "high-cpu-alarm", {
      alarmName: "EC2 CPU usage exceeds 80%",
      alarmDescription: "EC2 CPU usage exceeds 80%",
      metric: ec2CpuMetric,
      threshold: 80,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ec2CpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    const ec2MemMetric = new cloudwatch.Metric({
      namespace: "CWAgent",
      metricName: "mem_used_percent",
      dimensionsMap: {
        InstanceId: ec2InstanceId,
      },
      statistic: cloudwatch.Stats.AVERAGE,
      period: cdk.Duration.minutes(1),
    });
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: "Memory Usage (%)",
        metrics: [ec2MemMetric],
        width: 6,
        height: 6,
        setPeriodToTimeRange: true,
        sparkline: false,
      }),
      new cloudwatch.GraphWidget({
        title: "Memory Usage (%)",
        left: [ec2CpuMetric],
        width: 12,
        leftYAxis: {
          min: 0,
          max: 100,
        },
        leftAnnotations: [
          {
            value: 80,
            label: "Threshold",
            color: cloudwatch.Color.RED,
          },
        ],
      })
    );

    const ec2MemAlarm = new cloudwatch.Alarm(this, "high-memory-alarm", {
      alarmName: "EC2 Memory usage exceeds 80%",
      alarmDescription: "EC2 Memory usage exceeds 80%",
      metric: ec2MemMetric,
      threshold: 80,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ec2MemAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    const ec2DiskMetric = new cloudwatch.Metric({
      namespace: "CWAgent",
      metricName: "disk_used_percent",
      dimensionsMap: {
        InstanceId: ec2InstanceId,
        path: "/",
        device: "nvme0n1p1",
        fstype: "xfs",
      },
      statistic: cloudwatch.Stats.AVERAGE,
      period: cdk.Duration.minutes(1),
    });
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: "Disk Usage (%)",
        metrics: [ec2DiskMetric],
        width: 6,
        height: 6,
        setPeriodToTimeRange: true,
        sparkline: false,
      }),
      new cloudwatch.GraphWidget({
        title: "Disk Usage (%)",
        left: [ec2DiskMetric],
        width: 12,
        leftYAxis: {
          min: 0,
          max: 100,
        },
        leftAnnotations: [
          {
            value: 80,
            label: "Threshold",
            color: cloudwatch.Color.RED,
          },
        ],
      })
    );

    const ec2DiskAlarm = new cloudwatch.Alarm(this, "high-disk-usage-alarm", {
      alarmName: "EC2 Disk usage exceeds 80%",
      alarmDescription: "EC2 Disk usage exceeds 80%",
      metric: ec2DiskMetric,
      threshold: 80,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ec2DiskAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    dashboard.addWidgets(
      new cloudwatch.LogQueryWidget({
        logGroupNames: ["/nginx/access.log"],
        title: "Nginx Access Log",
        width: 12,
        height: 6,
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        queryLines: [
          "fields @timestamp, @logStream, @message",
          `filter @logStream like /${ec2Instance.instanceId}/`,
          "sort @timestamp desc",
          "limit 20",
        ],
      }),
      new cloudwatch.LogQueryWidget({
        logGroupNames: ["/pm2/app-out.log"],
        title: "App Out Log",
        width: 12,
        height: 6,
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        queryLines: [
          "fields @timestamp, @logStream, @message",
          `filter @logStream like /${ec2Instance.instanceId}/`,
          "sort @timestamp desc",
          "limit 20",
        ],
      })
    );

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: ["# RDS Instance"].join("\n"),
        width: 24,
        height: 1,
        background: cloudwatch.TextWidgetBackground.TRANSPARENT,
      })
    );

    const rdsCpuMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "CPUUtilization",
      dimensionsMap: {
        DBInstanceIdentifier: rdsInstanceIdentifier,
      },
      statistic: cloudwatch.Stats.AVERAGE,
      period: cdk.Duration.minutes(1),
    });
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: "CPU Usage (%)",
        metrics: [rdsCpuMetric],
        width: 6,
        height: 6,
        setPeriodToTimeRange: true,
        sparkline: false,
      }),
      new cloudwatch.GraphWidget({
        title: "CPU Usage (%)",
        left: [rdsCpuMetric],
        width: 12,
        leftYAxis: {
          min: 0,
          max: 100,
        },
        leftAnnotations: [
          {
            value: 80,
            label: "Threshold",
            color: cloudwatch.Color.RED,
          },
        ],
      })
    );

    const rdsCpuAlarm = new cloudwatch.Alarm(this, "high-cpu-usage-alarm", {
      alarmName: "RDS CPU usage exceeds 80%",
      alarmDescription: "RDS CPU usage exceeds 80%",
      metric: rdsCpuMetric,
      threshold: 80,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    rdsCpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    const rdsTotalMemoryBytes = 1 * 1024 * 1024 * 1024;
    const rdsMemoryThresholdRatio = 0.1;
    const rdsMemoryThresholdBytes =
      rdsTotalMemoryBytes * rdsMemoryThresholdRatio;

    const rdsMemoryMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "FreeableMemory",
      dimensionsMap: {
        DBInstanceIdentifier: rdsInstanceIdentifier,
      },
      statistic: cloudwatch.Stats.AVERAGE,
      period: cdk.Duration.minutes(1),
    });
    const rdsSwapMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "SwapUsage",
      dimensionsMap: {
        DBInstanceIdentifier: rdsInstanceIdentifier,
      },
      statistic: cloudwatch.Stats.AVERAGE,
      period: cdk.Duration.minutes(1),
    });

    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: "RDS Freeable Memory (bytes)",
        metrics: [rdsMemoryMetric],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: "RDS Freeable Memory Trend",
        left: [rdsMemoryMetric],
        width: 9,
        leftYAxis: {
          min: 0,
          max: rdsTotalMemoryBytes,
        },
        leftAnnotations: [
          {
            value: rdsMemoryThresholdBytes,
            label: "Threshold",
            color: cloudwatch.Color.RED,
          },
        ],
      }),
      new cloudwatch.GraphWidget({
        title: "RDS Swap Usage",
        left: [rdsSwapMetric],
        width: 9,
      })
    );

    const rdsMemAlarm = new cloudwatch.Alarm(
      this,
      "low-freeable-memory-alarm",
      {
        alarmName: "RDS FreeableMemory below 10%",
        alarmDescription: `RDS instance has less than ${
          rdsMemoryThresholdRatio * 100
        } free memory`,
        metric: rdsMemoryMetric,
        threshold: rdsMemoryThresholdBytes,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    rdsMemAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));
  }
}
