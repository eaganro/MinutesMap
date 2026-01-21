import type { S3Event } from "aws-lambda";
import { ApiGatewayManagementApiClient } from "@aws-sdk/client-apigatewaymanagementapi";
import {
  DynamoDBClient,
  QueryCommandInput,
  paginateQuery,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { sendPayloadInBatches } from "../shared/wsBatcher";

type HandlerEnv = {
  CONN_TABLE: string;
  WS_API_ENDPOINT: string;
  SEND_BATCH_SIZE: number;
  SEND_MAX_CONCURRENCY: number;
};

type HandlerDependencies = {
  dynamodb?: DynamoDBClient;
  apigwClient?: ApiGatewayManagementApiClient;
  env?: HandlerEnv;
  paginator?: typeof paginateQuery;
};

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_CONCURRENCY = 10;
const GAMEPACK_PATTERN = /^data\/gamepack\/(.+?)\.json/;
const BOX_PATTERN = /^data\/gameStats\/(.+?)\.json/;

export const handler = createHandler();

export function createHandler({
  dynamodb,
  apigwClient,
  env,
  paginator,
}: HandlerDependencies = {}) {
  const resolvedEnv = env ?? loadEnv();
  const resolvedDynamo = dynamodb ?? new DynamoDBClient({});
  const resolvedApigw =
    apigwClient ??
    new ApiGatewayManagementApiClient({
      endpoint: resolvedEnv.WS_API_ENDPOINT,
      retryMode: "adaptive",
    });
  const resolvedPaginator = paginator ?? paginateQuery;

  return async function handle(event: S3Event): Promise<{ statusCode: number }> {
    for (const record of event.Records ?? []) {
      const update = parseGameUpdate(record);
      if (!update) {
        continue;
      }

      const { gameId, key, version } = update;

      try {
        const payload = JSON.stringify({
          gameId,
          key,
          version,
        });

        for await (const connections of listConnectionPagesByGame(
          resolvedDynamo,
          resolvedEnv,
          gameId,
          resolvedPaginator
        )) {
          if (connections.length === 0) {
            continue;
          }

          await sendPayloadInBatches({
            apigwClient: resolvedApigw,
            dynamodb: resolvedDynamo,
            tableName: resolvedEnv.CONN_TABLE,
            connectionIds: connections,
            payload,
            batchSize: resolvedEnv.SEND_BATCH_SIZE,
            maxConcurrency: resolvedEnv.SEND_MAX_CONCURRENCY,
            logPrefix: `ws-sendGameUpdate ${gameId}`,
          });
        }
      } catch (error) {
        console.log(
          `Error notifying subscribers for game ${gameId}: ${formatError(error)}`
        );
        continue;
      }
    }

    return { statusCode: 200 };
  };
}

function loadEnv(): HandlerEnv {
  return {
    CONN_TABLE: process.env.CONN_TABLE ?? "",
    WS_API_ENDPOINT: process.env.WS_API_ENDPOINT ?? "",
    SEND_BATCH_SIZE: parsePositiveInt(
      process.env.SEND_BATCH_SIZE,
      DEFAULT_BATCH_SIZE
    ),
    SEND_MAX_CONCURRENCY: parsePositiveInt(
      process.env.SEND_MAX_CONCURRENCY,
      DEFAULT_MAX_CONCURRENCY
    ),
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseGameUpdate(
  record: S3Event["Records"][number]
): { gameId: string; key: string; version: string } | null {
  const key = record.s3?.object?.key;
  if (!key) {
    return null;
  }

  const decodedKey = decodeS3Key(key);
  const rawEtag = record.s3?.object?.eTag ?? "";
  const version = rawEtag.replace(/"/g, "");

  const packMatch = decodedKey.match(GAMEPACK_PATTERN);
  if (packMatch) {
    return {
      gameId: packMatch[1],
      key: decodedKey,
      version,
    };
  }

  const boxMatch = decodedKey.match(BOX_PATTERN);
  if (!boxMatch) {
    return null;
  }

  return {
    gameId: boxMatch[1],
    key: decodedKey,
    version,
  };
}

function decodeS3Key(key: string): string {
  return decodeURIComponent(key.replace(/\+/g, " "));
}

async function* listConnectionPagesByGame(
  dynamodb: DynamoDBClient,
  env: HandlerEnv,
  gameId: string,
  paginator: typeof paginateQuery
): AsyncGenerator<string[]> {
  const input: QueryCommandInput = {
    TableName: env.CONN_TABLE,
    IndexName: "gameId-index",
    KeyConditionExpression: "#gameId = :gameVal",
    ExpressionAttributeNames: {
      "#gameId": "gameId",
    },
    ExpressionAttributeValues: {
      ":gameVal": { S: gameId },
    },
  };

  for await (const page of paginator(
    { client: dynamodb, pageSize: env.SEND_BATCH_SIZE },
    input
  )) {
    const connectionIds: string[] = [];
    for (const item of page.Items ?? []) {
      const data = unmarshall(item);
      if (typeof data.connectionId === "string") {
        connectionIds.push(data.connectionId);
      }
    }
    if (connectionIds.length > 0) {
      yield connectionIds;
    }
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
