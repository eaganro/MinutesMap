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
  DATE_CONN_TABLE: string;
  DATE_INDEX_NAME: string;
  WS_API_ENDPOINT: string;
  SCHEDULE_PREFIX: string;
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

  return async function handle(event: S3Event): Promise<void> {
    const dates = new Set<string>();

    for (const record of event.Records ?? []) {
      if (record.eventSource && record.eventSource !== "aws:s3") {
        continue;
      }

      const key = record.s3?.object?.key;
      if (!key) {
        continue;
      }

      const dateStr = extractDateFromKey(key, resolvedEnv.SCHEDULE_PREFIX);
      if (dateStr) {
        dates.add(dateStr);
      }
    }

    for (const dateStr of dates) {
      await notifySubscribers(
        resolvedDynamo,
        resolvedApigw,
        resolvedEnv,
        dateStr,
        resolvedPaginator
      );
    }
  };
}

function loadEnv(): HandlerEnv {
  return {
    DATE_CONN_TABLE: process.env.DATE_CONN_TABLE ?? "DateConnections",
    DATE_INDEX_NAME: process.env.DATE_INDEX_NAME ?? "date-index",
    WS_API_ENDPOINT: process.env.WS_API_ENDPOINT ?? "",
    SCHEDULE_PREFIX: process.env.SCHEDULE_PREFIX ?? "schedule/",
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

function extractDateFromKey(key: string, schedulePrefix: string): string | null {
  const decoded = decodeS3Key(key);
  if (!decoded.startsWith(schedulePrefix)) {
    return null;
  }

  let filename = decoded.slice(schedulePrefix.length);
  let matchedSuffix = false;
  for (const suffix of [".json.gz", ".json"]) {
    if (filename.endsWith(suffix)) {
      filename = filename.slice(0, -suffix.length);
      matchedSuffix = true;
      break;
    }
  }

  if (!matchedSuffix) {
    return null;
  }

  const dateStr = filename.split("/").pop() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }

  return dateStr;
}

function decodeS3Key(key: string): string {
  return decodeURIComponent(key.replace(/\+/g, " "));
}

async function notifySubscribers(
  dynamodb: DynamoDBClient,
  apigwClient: ApiGatewayManagementApiClient,
  env: HandlerEnv,
  dateStr: string,
  paginator: typeof paginateQuery
): Promise<void> {
  let totalConnections = 0;
  try {
    const payload = JSON.stringify({
      type: "date_update",
      date: dateStr,
    });

    for await (const connections of listConnectionPagesByDate(
      dynamodb,
      env,
      dateStr,
      paginator
    )) {
      if (connections.length === 0) {
        continue;
      }

      totalConnections += connections.length;
      await sendPayloadInBatches({
        apigwClient,
        dynamodb,
        tableName: env.DATE_CONN_TABLE,
        connectionIds: connections,
        payload,
        batchSize: env.SEND_BATCH_SIZE,
        maxConcurrency: env.SEND_MAX_CONCURRENCY,
        logPrefix: `gameDateUpdates ${dateStr}`,
      });
    }
  } catch (error) {
    console.log(`Error notifying subscribers: ${formatError(error)}`);
    return;
  }

  if (totalConnections > 0) {
    console.log(`Notified ${totalConnections} connections for date ${dateStr}`);
  }
}

async function* listConnectionPagesByDate(
  dynamodb: DynamoDBClient,
  env: HandlerEnv,
  dateStr: string,
  paginator: typeof paginateQuery
): AsyncGenerator<string[]> {
  const input: QueryCommandInput = {
    TableName: env.DATE_CONN_TABLE,
    IndexName: env.DATE_INDEX_NAME,
    KeyConditionExpression: "#date = :dateVal",
    ExpressionAttributeNames: {
      "#date": "dateString",
    },
    ExpressionAttributeValues: {
      ":dateVal": { S: dateStr },
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
