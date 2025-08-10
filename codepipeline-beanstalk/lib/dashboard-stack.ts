import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";

export interface DashboardStackProps extends cdk.StackProps {
  loadBalancerName: string;
  autoScalingGroupName: string;
}

export class DashboardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DashboardStackProps) {
    super(scope, id, props);

    const { loadBalancerName, autoScalingGroupName } = props;

    const dashboard = new cloudwatch.Dashboard(this, "dashboard", {
      dashboardName: "myproject-dashboard",
    });

    const requestCountMetric = new cloudwatch.Metric({
      namespace: "AWS/ApplicationELB",
      metricName: "RequestCount",
      dimensionsMap: {
        LoadBalancerName: loadBalancerName,
      },
      statistic: "Sum",
      period: cdk.Duration.minutes(1),
    });
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Request Count",
        left: [requestCountMetric],
        width: 12,
      })
    );

    const cpuMetric = new cloudwatch.Metric({
      namespace: "AWS/EC2",
      metricName: "CPUUtilization",
      dimensionsMap: {
        AutoScalingGroupName: autoScalingGroupName,
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
        title: "CPU Usage (%)",
        left: [cpuMetric],
        width: 12,
      })
    );
  }
}
