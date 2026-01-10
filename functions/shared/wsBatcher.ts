import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import {
  BatchWriteItemCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";

export type BatchSendOptions = {
  batchSize: number;
  maxConcurrency: number;
};

type SendPayloadInput = {
  apigwClient: ApiGatewayManagementApiClient;
  dynamodb: DynamoDBClient;
  tableName: string;
  connectionIds: string[];
  payload: string;
  batchSize: number;
  maxConcurrency: number;
  logPrefix?: string;
};

export async function sendPayloadInBatches({
  apigwClient,
  dynamodb,
  tableName,
  connectionIds,
  payload,
  batchSize,
  maxConcurrency,
  logPrefix = "",
}: SendPayloadInput): Promise<void> {
  if (connectionIds.length === 0) {
    return;
  }

  const safeBatchSize = Math.max(1, batchSize);
  const safeConcurrency = Math.max(1, maxConcurrency);
  const batches = chunkArray(connectionIds, safeBatchSize);

  for (const batch of batches) {
    const results = await mapWithConcurrency(batch, safeConcurrency, (connectionId) =>
      sendToConnection(apigwClient, connectionId, payload, logPrefix)
    );
    const staleIds = results
      .filter((result) => result.stale)
      .map((result) => result.connectionId);

    if (staleIds.length > 0) {
      await deleteStaleConnections(dynamodb, tableName, staleIds, logPrefix);
    }
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type SendResult = {
  connectionId: string;
  stale: boolean;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  maxConcurrency: number,
  mapFn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(maxConcurrency, items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }

      results[index] = await mapFn(items[index] as T);
    }
  });

  await Promise.all(workers);
  return results;
}

async function sendToConnection(
  apigwClient: ApiGatewayManagementApiClient,
  connectionId: string,
  payload: string,
  logPrefix: string
): Promise<SendResult> {
  try {
    await apigwClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(payload),
      })
    );
    return { connectionId, stale: false };
  } catch (error) {
    if (isGoneException(error)) {
      logWithPrefix(logPrefix, `Found stale connection: ${connectionId}`);
      return { connectionId, stale: true };
    }

    logWithPrefix(
      logPrefix,
      `Failed to send to ${connectionId}: ${formatError(error)}`,
      console.error
    );
    return { connectionId, stale: false };
  }
}

async function deleteStaleConnections(
  dynamodb: DynamoDBClient,
  tableName: string,
  connectionIds: string[],
  logPrefix: string
): Promise<void> {
  const batches = chunkArray(connectionIds, 25);

  for (const batch of batches) {
    await deleteBatchWithRetry(dynamodb, tableName, batch, logPrefix);
  }
}

async function deleteBatchWithRetry(
  dynamodb: DynamoDBClient,
  tableName: string,
  connectionIds: string[],
  logPrefix: string
): Promise<void> {
  const maxAttempts = 5;
  let pending = connectionIds;

  for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt += 1) {
    const requestItems = {
      [tableName]: pending.map((connectionId) => ({
        DeleteRequest: {
          Key: {
            connectionId: { S: connectionId },
          },
        },
      })),
    };

    let result;
    try {
      result = await dynamodb.send(
        new BatchWriteItemCommand({
          RequestItems: requestItems,
        })
      );
    } catch (error) {
      logWithPrefix(
        logPrefix,
        `Failed batch delete attempt ${attempt}: ${formatError(error)}`,
        console.error
      );
      await delay(backoffDelay(attempt));
      continue;
    }

    const unprocessed = result.UnprocessedItems?.[tableName] ?? [];
    pending = unprocessed
      .map((item) => item.DeleteRequest?.Key?.connectionId?.S)
      .filter((value): value is string => Boolean(value));

    if (pending.length > 0) {
      await delay(backoffDelay(attempt));
    }
  }

  if (pending.length > 0) {
    logWithPrefix(
      logPrefix,
      `Failed to delete ${pending.length} stale connections after retries.`,
      console.error
    );
  }
}

function isGoneException(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  if (maybeError.name === "GoneException") {
    return true;
  }

  return maybeError.$metadata?.httpStatusCode === 410;
}

function logWithPrefix(
  prefix: string,
  message: string,
  logFn: (message: string) => void = console.log
): void {
  const fullMessage = prefix ? `${prefix}: ${message}` : message;
  logFn(fullMessage);
}

function backoffDelay(attempt: number): number {
  const base = 100;
  const cap = 2000;
  return Math.min(cap, base * 2 ** (attempt - 1));
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
