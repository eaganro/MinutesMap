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
import { createHandler } from "../ws-sendGameUpdate-handler/lambda_function.ts";

describe("ws-sendGameUpdate-handler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends updates and deletes stale connections", async () => {
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
          Items: [
            { connectionId: { S: "c1" } },
            { connectionId: { S: "gone" } },
          ],
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

      if (input.ConnectionId === "gone") {
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
        CONN_TABLE: "GameConnections",
        WS_API_ENDPOINT: "https://example.com",
        SEND_BATCH_SIZE: 50,
        SEND_MAX_CONCURRENCY: 10,
      },
    });

    const event = {
      Records: [
        {
          s3: {
            object: {
              key: "data/gamepack/12345.json",
              eTag: "\"etag123\"",
            },
          },
        },
      ],
    } as S3Event;

    await handler(event);

    expect(paginateCalls).toBe(1);
    expect(postCalls.map((call) => call.ConnectionId)).toEqual(
      expect.arrayContaining(["c1", "gone"])
    );
    expect(deleteCalls).toHaveLength(1);
    const deleteRequests = deleteCalls[0]?.RequestItems?.GameConnections ?? [];
    const deletedIds = deleteRequests
      .map((item) => item.DeleteRequest?.Key?.connectionId?.S)
      .filter((value): value is string => Boolean(value));
    expect(deletedIds).toEqual(expect.arrayContaining(["gone"]));

    const dataValue = postCalls[0]?.Data;
    const payload =
      typeof dataValue === "string"
        ? dataValue
        : Buffer.from(dataValue as Uint8Array).toString();
    expect(JSON.parse(payload)).toEqual({
      gameId: "12345",
      key: "data/gamepack/12345.json",
      version: "etag123",
    });
  });

  it("sends box score updates", async () => {
    const dynamodb = new DynamoDBClient({});
    const apigwClient = new ApiGatewayManagementApiClient({
      endpoint: "https://example.com",
    });

    let paginateCalls = 0;
    const paginator = (
      _config: { client: DynamoDBClient; pageSize?: number },
      _input: QueryCommandInput
    ) => {
      paginateCalls += 1;
      async function* iterator() {
        yield {
          Items: [{ connectionId: { S: "c1" } }],
        };
      }

      return iterator();
    };

    const postCalls: PostToConnectionCommandInput[] = [];
    vi.spyOn(apigwClient, "send").mockImplementation(async (command) => {
      if (!(command instanceof PostToConnectionCommand)) {
        throw new Error("Unexpected API Gateway command");
      }

      postCalls.push(command.input);
      return {};
    });

    const handler = createHandler({
      dynamodb,
      apigwClient,
      paginator,
      env: {
        CONN_TABLE: "GameConnections",
        WS_API_ENDPOINT: "https://example.com",
        SEND_BATCH_SIZE: 50,
        SEND_MAX_CONCURRENCY: 10,
      },
    });

    const event = {
      Records: [
        {
          s3: {
            object: {
              key: "data/gameStats/999.json",
              eTag: "\"etag999\"",
            },
          },
        },
      ],
    } as S3Event;

    await handler(event);

    expect(paginateCalls).toBe(1);
    expect(postCalls).toHaveLength(1);

    const dataValue = postCalls[0]?.Data;
    const payload =
      typeof dataValue === "string"
        ? dataValue
        : Buffer.from(dataValue as Uint8Array).toString();
    expect(JSON.parse(payload)).toEqual({
      gameId: "999",
      key: "data/gameStats/999.json",
      version: "etag999",
    });
  });

  it("ignores non-matching keys", async () => {
    const dynamodb = new DynamoDBClient({});
    const apigwClient = new ApiGatewayManagementApiClient({
      endpoint: "https://example.com",
    });

    let paginateCalls = 0;
    const paginator = (
      _config: { client: DynamoDBClient; pageSize?: number },
      _input: QueryCommandInput
    ) => {
      paginateCalls += 1;
      async function* iterator() {}

      return iterator();
    };
    const ddbSend = vi
      .spyOn(dynamodb, "send")
      .mockRejectedValue(new Error("Unexpected call"));
    const apigwSend = vi
      .spyOn(apigwClient, "send")
      .mockRejectedValue(new Error("Unexpected call"));

    const handler = createHandler({
      dynamodb,
      apigwClient,
      paginator,
      env: {
        CONN_TABLE: "GameConnections",
        WS_API_ENDPOINT: "https://example.com",
        SEND_BATCH_SIZE: 50,
        SEND_MAX_CONCURRENCY: 10,
      },
    });

    const event = {
      Records: [
        {
          s3: {
            object: {
              key: "data/otherData/12345.json",
              eTag: "\"etag123\"",
            },
          },
        },
      ],
    } as S3Event;

    await handler(event);

    expect(paginateCalls).toBe(0);
    expect(ddbSend).not.toHaveBeenCalled();
    expect(apigwSend).not.toHaveBeenCalled();
  });
});
