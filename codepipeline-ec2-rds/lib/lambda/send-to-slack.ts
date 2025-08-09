import { SNSEvent } from "aws-lambda";
import { DateTime } from "luxon";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

interface SnsMessage {
  AlarmName: string;
  AlarmDescription?: string;
  AWSAccountId: string;
  AlarmConfigurationUpdatedTimestamp: string;
  NewStateValue: "OK" | "ALARM" | "INSUFFICIENT_DATA";
  NewStateReason: string;
  StateChangeTime: string;
  Region: string;
  AlarmArn: string;
  OldStateValue: "OK" | "ALARM" | "INSUFFICIENT_DATA";
  OKActions: string[];
  AlarmActions: string[];
  InsufficientDataActions: string[];
  Trigger: {
    MetricName: string;
    Namespace: string;
    StatisticType: string;
    Statistic: string;
    Unit?: string | null;
    Dimensions: Array<{ name: string; value: string }>;
    Period: number;
    EvaluationPeriods: number;
    ComparisonOperator: string;
    Threshold: number;
    TreatMissingData: string;
    EvaluateLowSampleCountPercentile?: string;
  };
}

const buildSlackMessage = (message: SnsMessage) => {
  const header = `🚨 [${message.Trigger.Namespace}] ${message.AlarmName} - ${message.NewStateValue}`;

  const alarmDescription = {
    type: "plain_text",
    text: `🚨 ${message.AlarmDescription ?? "unknown"}`,
  };

  const metric = {
    type: "mrkdwn",
    text: `*Metric:*\n${message.Trigger.MetricName}`,
  };
  const namespace = {
    type: "mrkdwn",
    text: `*Namespace:*\n${message.Trigger.Namespace}`,
  };

  const region = {
    type: "mrkdwn",
    text: `*Region:*\n${message.Region}`,
  };
  const time = {
    type: "mrkdwn",
    text: `*Time:*\n${DateTime.fromISO(message.StateChangeTime, {
      zone: "utc",
    })
      .setZone("Asia/Seoul")
      .toFormat("YYYY-MM-DD HH:mm:ss (KST)")}\n${DateTime.fromISO(
      message.StateChangeTime,
      { zone: "utc" }
    ).toFormat("YYYY-MM-DD HH:mm:ss (UTC)")}`,
  };

  const dimensions = `*Dimensions:*\n${
    message.Trigger.Dimensions?.map(
      ({ name, value }) => `• ${name} = \`${value}\``
    ).join("\n") || "—"
  }`;

  const reason = {
    type: "mrkdwn",
    text: `*Reason:*\n${message.NewStateReason}`,
  };

  return {
    text: header,
    blocks: [
      {
        type: "header",
        text: alarmDescription,
      },
      {
        type: "section",
        fields: [metric, namespace],
      },
      {
        type: "section",
        fields: [region, time],
      },
      {
        type: "section",
        text: reason,
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: dimensions,
        },
      },
    ],
  };
};

export const handler = async (event: SNSEvent) => {
  if (!SLACK_WEBHOOK_URL) {
    return;
  }

  const records = event.Records;

  for (const record of records) {
    try {
      const message = JSON.parse(record.Sns.Message) as SnsMessage;

      const slackMessage = buildSlackMessage(message);

      await fetch(SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(slackMessage),
      });
    } catch (e) {
      console.error("Failed to send slack notification", e);
    }
  }
};
