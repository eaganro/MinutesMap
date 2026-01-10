import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { sendPayloadInBatches } from "../shared/wsBatcher";

describe("sendPayloadInBatches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs non-410 errors and continues sending", async () => {
    const apigwClient = new ApiGatewayManagementApiClient({
      endpoint: "https://example.com",
    });
    const dynamodb = new DynamoDBClient({});

    vi.spyOn(dynamodb, "send").mockImplementation(async () => {
      throw new Error("Unexpected DynamoDB command");
    });

    const sendMock = vi.spyOn(apigwClient, "send").mockImplementation(async (command) => {
      if (!(command instanceof PostToConnectionCommand)) {
        throw new Error("Unexpected API Gateway command");
      }

      const { ConnectionId } = command.input;
      if (ConnectionId === "throttle") {
        const error = Object.assign(new Error("Throttle"), {
          name: "ThrottlingException",
          $metadata: { httpStatusCode: 429 },
        });
        throw error;
      }

      if (ConnectionId === "boom") {
        const error = Object.assign(new Error("Boom"), {
          name: "InternalServerError",
          $metadata: { httpStatusCode: 500 },
        });
        throw error;
      }

      return {};
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendPayloadInBatches({
      apigwClient,
      dynamodb,
      tableName: "GameConnections",
      connectionIds: ["ok", "throttle", "boom"],
      payload: "{}",
      batchSize: 3,
      maxConcurrency: 2,
      logPrefix: "ws-batcher",
    });

    expect(sendMock).toHaveBeenCalledTimes(3);
    const errorMessages = errorSpy.mock.calls.map(([message]) => String(message));
    expect(
      errorMessages.some((message) =>
        message.includes("Failed to send to throttle")
      )
    ).toBe(true);
    expect(
      errorMessages.some((message) => message.includes("Failed to send to boom"))
    ).toBe(true);
  });
});
