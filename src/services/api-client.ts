"use client";

import { del, get, patch, post, put } from "aws-amplify/api";
import type { DocumentType } from "@aws-amplify/core/internals/utils";

const DEFAULT_API_NAME =
  process.env.NEXT_PUBLIC_USERDATA_API_NAME ?? "UserDataAPI";

export class ApiClientError extends Error {
  statusCode?: number;
  data?: unknown;
  originalError?: unknown;

  constructor(
    message: string,
    options?: { statusCode?: number; data?: unknown; cause?: unknown },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = options?.statusCode;
    this.data = options?.data;
    this.originalError = options?.cause;
  }
}

type QueryParams = Record<string, string | number | boolean | undefined>;

interface RestRequestOptions {
  apiName?: string;
  headers?: Record<string, string>;
  queryParams?: QueryParams;
}

interface RestMutationOptions<TBody> extends RestRequestOptions {
  body?: TBody;
}

type RestOperation =
  | ReturnType<typeof get>
  | ReturnType<typeof post>
  | ReturnType<typeof put>
  | ReturnType<typeof patch>
  | ReturnType<typeof del>;

function resolveApiName(apiName?: string) {
  return apiName ?? DEFAULT_API_NAME;
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

async function readBody(body?: { text?: () => Promise<string> }) {
  if (!body?.text) {
    return undefined;
  }

  const raw = await body.text();
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function executeOperation<T>(operation: RestOperation): Promise<T> {
  try {
    const { body, statusCode } = await operation.response;
    const payload = await readBody(body);

    if (statusCode >= 200 && statusCode < 300) {
      return payload as T;
    }

    throw new ApiClientError(`Request failed with status ${statusCode}`, {
      statusCode,
      data: payload,
    });
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    const restError = error as {
      response?: { statusCode?: number; body?: { text?: () => Promise<string> } };
    };

    let responseBody: unknown;
    if (restError.response?.body?.text) {
      try {
        responseBody = await readBody(restError.response.body);
      } catch {
        responseBody = undefined;
      }
    }

    throw new ApiClientError("REST request failed", {
      statusCode: restError.response?.statusCode,
      data: responseBody,
      cause: error,
    });
  }
}

export async function apiGet<T = unknown>(
  path: string,
  options: RestRequestOptions = {},
) {
  const operation = get({
    apiName: resolveApiName(options.apiName),
    path: normalizePath(path),
    options: {
      headers: options.headers,
      queryParams: normalizeQueryParams(options.queryParams),
    },
  });

  return executeOperation<T>(operation);
}

export async function apiPost<T = unknown, TBody = unknown>(
  path: string,
  options: RestMutationOptions<TBody> = {},
) {
  const operation = post({
    apiName: resolveApiName(options.apiName),
    path: normalizePath(path),
    options: {
      headers: options.headers,
      queryParams: normalizeQueryParams(options.queryParams),
      body: options.body as DocumentType | FormData | undefined,
    },
  });

  return executeOperation<T>(operation);
}

export async function apiPut<T = unknown, TBody = unknown>(
  path: string,
  options: RestMutationOptions<TBody> = {},
) {
  const operation = put({
    apiName: resolveApiName(options.apiName),
    path: normalizePath(path),
    options: {
      headers: options.headers,
      queryParams: normalizeQueryParams(options.queryParams),
      body: options.body as DocumentType | FormData | undefined,
    },
  });

  return executeOperation<T>(operation);
}

export async function apiPatch<T = unknown, TBody = unknown>(
  path: string,
  options: RestMutationOptions<TBody> = {},
) {
  const operation = patch({
    apiName: resolveApiName(options.apiName),
    path: normalizePath(path),
    options: {
      headers: options.headers,
      queryParams: normalizeQueryParams(options.queryParams),
      body: options.body as DocumentType | FormData | undefined,
    },
  });

  return executeOperation<T>(operation);
}

export async function apiDelete<T = unknown>(
  path: string,
  options: RestRequestOptions = {},
) {
  const operation = del({
    apiName: resolveApiName(options.apiName),
    path: normalizePath(path),
    options: {
      headers: options.headers,
      queryParams: normalizeQueryParams(options.queryParams),
    },
  });

  return executeOperation<T>(operation);
}

function normalizeQueryParams(queryParams?: QueryParams) {
  if (!queryParams) {
    return undefined;
  }

  return Object.entries(queryParams).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (value === undefined) {
        return acc;
      }
      acc[key] = String(value);
      return acc;
    },
    {},
  );
}
