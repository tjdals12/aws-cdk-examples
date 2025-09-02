import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import { z } from "zod";

const EventLog = z.preprocess(
  (input) => {
    if (typeof input === "string") {
      return JSON.parse(input);
    }
    throw new Error("Invalid JSON format");
  },
  z.object({
    event_uuid: z.uuid({ version: "v4" }),
    event_name: z.string(),
    event_timestamp: z.iso.datetime(),
    event_params: z
      .record(z.string(), z.any())
      .optional()
      .transform((v) => JSON.stringify(v)),
  })
);

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const { body } = event;

  const now = new Date();

  const common_payload = {
    gw_request_id: event.requestContext.requestId,
    lambda_request_id: context.awsRequestId,
    received_at: now.toISOString(),
  };

  try {
    const payload = EventLog.parse(body);
    const event_date = payload.event_timestamp.slice(0, 10);

    console.log({
      kind: "app_event",
      event_date,
      ...payload,
      ...common_payload,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "ok",
      }),
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    const stack = e instanceof Error ? e.stack : "unknown";

    console.error({
      kind: "app_event_error",
      stack,
      ...common_payload,
    });

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
      }),
    };
  }
};
