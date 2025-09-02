import {
  Context,
  FirehoseTransformationEvent,
  FirehoseTransformationResult,
  FirehoseTransformationResultRecord,
} from "aws-lambda";

export const handler = async (
  event: FirehoseTransformationEvent,
  context: Context
): Promise<FirehoseTransformationResult> => {
  const invocation_id = event.invocationId;
  const lambda_request_id = context.awsRequestId;

  const records = event.records.map<FirehoseTransformationResultRecord>(
    (record) => {
      const { recordId, data } = record;

      try {
        const textPayload = Buffer.from(data, "base64").toString("utf-8");
        const inputLines = textPayload.split(/\r?\n/);
        const outputLines: string[] = [];

        for (const inputLine of inputLines) {
          const trimmed = inputLine.trim();
          if (!trimmed) continue;

          const parsed = JSON.parse(trimmed);
          if (!parsed) continue;

          const outputLine = JSON.stringify(parsed.message);
          outputLines.push(outputLine);
        }

        if (outputLines.length === 0) {
          return { recordId, result: "Dropped" };
        }

        const payload = outputLines.join("\n") + "\n";

        return {
          recordId,
          result: "Ok",
          data: Buffer.from(payload).toString("base64"),
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        const stack = e instanceof Error ? e.stack : "stack";

        console.error({
          invocation_id,
          lambda_request_id,
          record_id: recordId,
          message,
          stack,
        });

        return { recordId, result: "ProcessingFailed" };
      }
    }
  );
  return {
    records,
  };
};
