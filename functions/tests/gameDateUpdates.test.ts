import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  type PostToConnectionCommandInput,
} from "@aws-sdk/client-apigatewaymanagementapi";
import {
  BatchWriteItemCommand,
  DynamoDBClient,
  type BatchWriteItemCommandInput,
  type QueryCommandInput,
} from "@aws-sdk/client-dynamodb";
import type { S3Event } from "aws-lambda";
import { createHandler } from "../gameDateUpdates/lambda_function.ts";

describe("gameDateUpdates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fans out with pagination and deletes stale connections", async () => {
    const dynamodb = new DynamoDBClient({});
    const apigwClient = new ApiGatewayManagementApiClient({
      endpoint: "https://example.com",
    });

    const deleteCalls: BatchWriteItemCommandInput[] = [];
    let paginateCalls = 0;
    const paginator = (
      _config: { client: DynamoDBClient; pageSize?: number },
      _input: QueryCommandInput
    ) => {
      paginateCalls += 1;
      async function* iterator() {
        yield {
          Items: [{ connectionId: { S: "c1" } }],
          LastEvaluatedKey: {
            connectionId: { S: "c1" },
            dateString: { S: "2023-12-25" },
          },
        };
        yield {
          Items: [{ connectionId: { S: "stale" } }],
        };
      }

      return iterator();
    };

    vi.spyOn(dynamodb, "send").mockImplementation(async (command) => {
      if (command instanceof BatchWriteItemCommand) {
        deleteCalls.push(command.input);
        return {};
      }

      throw new Error("Unexpected DynamoDB command");
    });

    const postCalls: PostToConnectionCommandInput[] = [];
    vi.spyOn(apigwClient, "send").mockImplementation(async (command) => {
      if (!(command instanceof PostToConnectionCommand)) {
        throw new Error("Unexpected API Gateway command");
      }

      const input = command.input;
      postCalls.push(input);

      if (input.ConnectionId === "stale") {
        const error = Object.assign(new Error("Gone"), {
          name: "GoneException",
          $metadata: { httpStatusCode: 410 },
        });
        throw error;
      }

      return {};
    });

    const handler = createHandler({
      dynamodb,
      apigwClient,
      paginator,
      env: {
        DATE_CONN_TABLE: "DateConnections",
        DATE_INDEX_NAME: "date-index",
        WS_API_ENDPOINT: "https://example.com",
        SCHEDULE_PREFIX: "schedule/",
        SEND_BATCH_SIZE: 50,
        SEND_MAX_CONCURRENCY: 10,
      },
    });

    const event = {
      Records: [
        {
          eventSource: "aws:s3",
          s3: {
            object: {
              key: "schedule/2023-12-25.json.gz",
            },
          },
        },
      ],
    } as S3Event;

    await handler(event);

    expect(paginateCalls).toBe(1);
    expect(postCalls.map((call) => call.ConnectionId)).toEqual(
      expect.arrayContaining(["c1", "stale"])
    );
    expect(deleteCalls).toHaveLength(1);
    const deleteRequests = deleteCalls[0]?.RequestItems?.DateConnections ?? [];
    const deletedIds = deleteRequests
      .map((item) => item.DeleteRequest?.Key?.connectionId?.S)
      .filter((value): value is string => Boolean(value));
    expect(deletedIds).toEqual(expect.arrayContaining(["stale"]));

    const dataValue = postCalls[0]?.Data;
    const payload =
      typeof dataValue === "string"
        ? dataValue
        : Buffer.from(dataValue as Uint8Array).toString();
    expect(JSON.parse(payload)).toEqual({
      type: "date_update",
      date: "2023-12-25",
    });
  });

  it("dedupes schedule updates and ignores unrelated keys", async () => {
    const dynamodb = new DynamoDBClient({});
    const apigwClient = new ApiGatewayManagementApiClient({
      endpoint: "https://example.com",
    });

    const requestedDates: string[] = [];
    const paginator = (
      _config: { client: DynamoDBClient; pageSize?: number },
      input: QueryCommandInput
    ) => {
      const dateValue = input.ExpressionAttributeValues?.[":dateVal"]?.S;
      if (typeof dateValue === "string") {
        requestedDates.push(dateValue);
      }

      async function* iterator() {
        yield {
          Items: [],
        };
      }

      return iterator();
    };

    const handler = createHandler({
      dynamodb,
      apigwClient,
      paginator,
      env: {
        DATE_CONN_TABLE: "DateConnections",
        DATE_INDEX_NAME: "date-index",
        WS_API_ENDPOINT: "https://example.com",
        SCHEDULE_PREFIX: "schedule/",
        SEND_BATCH_SIZE: 50,
        SEND_MAX_CONCURRENCY: 10,
      },
    });

    const event = {
      Records: [
        {
          eventSource: "aws:s3",
          s3: {
            object: {
              key: "schedule/2023-12-25.json",
            },
          },
        },
        {
          eventSource: "aws:s3",
          s3: {
            object: {
              key: "schedule/2023-12-25.json.gz",
            },
          },
        },
        {
          eventSource: "aws:s3",
          s3: {
            object: {
              key: "schedule/not-a-date.json.gz",
            },
          },
        },
        {
          eventSource: "aws:s3",
          s3: {
            object: {
              key: "data/boxData/123.json",
            },
          },
        },
      ],
    } as S3Event;

    await handler(event);

    expect(requestedDates).toEqual(["2023-12-25"]);
  });
});
