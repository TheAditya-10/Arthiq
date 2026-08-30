/**
 * Typed API client for apps/web. Always sends credentials: "include" so the
 * refresh-token httpOnly cookie set by the API is attached (docs/ADR/003).
 * The access token is kept in memory (AuthProvider), never localStorage, to
 * reduce XSS token-theft surface.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

let currentAccessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Skip the automatic refresh-and-retry-once behavior (used by /auth/refresh itself). */
  skipRefresh?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path, API_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(currentAccessToken ? { authorization: `Bearer ${currentAccessToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const error = payload?.error ?? { code: "UNKNOWN", message: res.statusText };
    throw new ApiClientError(error.message, res.status, error.code, error.details);
  }
  return payload as T;
}

/** Refreshes the access token using the httpOnly refresh cookie. Returns the new token, or null if refresh failed. */
export async function tryRefreshAccessToken(): Promise<string | null> {
  try {
    const result = await rawRequest<{ accessToken: string }>("/auth/refresh", {
      method: "POST",
      skipRefresh: true,
    });
    setAccessToken(result.accessToken);
    return result.accessToken;
  } catch {
    setAccessToken(null);
    return null;
  }
}

/** Wraps rawRequest with a single refresh-and-retry on a 401 (access token expired). */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401 && !options.skipRefresh) {
      const refreshed = await tryRefreshAccessToken();
      if (refreshed) return rawRequest<T>(path, options);
    }
    throw err;
  }
}

/** For multipart uploads — bypasses the JSON content-type/serialization in rawRequest. */
async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: "POST",
    credentials: "include",
    headers: currentAccessToken ? { authorization: `Bearer ${currentAccessToken}` } : {},
    body: formData,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const error = payload?.error ?? { code: "UNKNOWN", message: res.statusText };
    throw new ApiClientError(error.message, res.status, error.code, error.details);
  }
  return payload as T;
}

// ---------------------------------------------------------------------------
// Domain types (kept intentionally light — the API is the source of truth;
// these describe only what the web app actually reads/writes today).
// ---------------------------------------------------------------------------

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  openingBalance: number;
  openingBalanceDate: string;
  archivedAt: string | null;
}

export interface Bucket {
  id: string;
  name: string;
  archivedAt: string | null;
}

export interface SubBucket {
  id: string;
  bucketId: string;
  name: string;
  archivedAt: string | null;
}

export interface EventItem {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  archivedAt: string | null;
}

export interface Person {
  id: string;
  name: string;
  notes: string | null;
  archivedAt: string | null;
}

export interface PersonWithBalance extends Person {
  receivable: number;
  payable: number;
  outstanding: number;
}

export interface PeopleLedgerEntryRow {
  id: string;
  personId: string;
  transactionId: string;
  entryType: "LENT" | "BORROWED" | "REPAYMENT_RECEIVED" | "REPAYMENT_MADE";
  amount: number;
  occurredAt: string;
  dueDate: string | null;
  notes: string | null;
}

export interface TransactionRow {
  id: string;
  accountId: string;
  toAccountId: string | null;
  type: string;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  occurredAt: string;
  merchantRaw: string | null;
  description: string | null;
  bucketId: string | null;
  subBucketId: string | null;
  eventId: string | null;
  personId: string | null;
  source: string;
  classificationSource: string;
  classificationConfidence: number | null;
  status: string;
}

export interface TransactionListResult {
  items: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const api = {
  auth: {
    register: (input: { email: string; password: string; displayName: string }) =>
      request<{ accessToken: string; user: CurrentUser }>("/auth/register", {
        method: "POST",
        body: input,
        skipRefresh: true,
      }),
    login: (input: { email: string; password: string }) =>
      request<{ accessToken: string; user: CurrentUser }>("/auth/login", {
        method: "POST",
        body: input,
        skipRefresh: true,
      }),
    logout: () => request<void>("/auth/logout", { method: "POST", skipRefresh: true }),
    me: () => request<CurrentUser>("/auth/me"),
  },
  accounts: {
    list: () => request<Account[]>("/accounts"),
  },
  buckets: {
    list: () => request<Bucket[]>("/buckets"),
  },
  subBuckets: {
    list: (bucketId?: string) => request<SubBucket[]>("/sub-buckets", { query: { bucketId } }),
  },
  events: {
    list: () => request<EventItem[]>("/events"),
  },
  people: {
    list: () => request<Person[]>("/people"),
    get: (id: string) => request<PersonWithBalance>(`/people/${id}`),
    create: (input: { name: string; notes?: string }) =>
      request<Person>("/people", { method: "POST", body: input }),
    ledger: (id: string) => request<PeopleLedgerEntryRow[]>(`/people/${id}/ledger`),
    addLedgerEntry: (input: {
      personId: string;
      entryType: "LENT" | "BORROWED" | "REPAYMENT_RECEIVED" | "REPAYMENT_MADE";
      accountId: string;
      amount: number;
      occurredAt: string;
      dueDate?: string;
      notes?: string;
    }) => request<TransactionRow>("/people-ledger", { method: "POST", body: input }),
  },
  transactions: {
    list: (query: Record<string, string | number | undefined>) =>
      request<TransactionListResult>("/transactions", { query }),
    update: (
      id: string,
      input: Partial<{
        bucketId: string;
        subBucketId: string;
        eventId: string;
        description: string;
      }>,
    ) => request<TransactionRow>(`/transactions/${id}`, { method: "PATCH", body: input }),
    remove: (id: string) => request<void>(`/transactions/${id}`, { method: "DELETE" }),
  },
  imports: {
    preview: (accountId: string, file: File) => {
      const formData = new FormData();
      formData.append("accountId", accountId);
      formData.append("file", file);
      return uploadRequest<ImportPreview>("/imports/preview", formData);
    },
    commit: (importId: string, columnMapping: ColumnMapping) =>
      request<ImportCommitResult>(`/imports/${importId}/commit`, {
        method: "POST",
        body: { columnMapping },
      }),
  },
  reconciliation: {
    list: (accountId?: string) =>
      request<ReconciliationRow[]>("/reconciliation", { query: { accountId } }),
    run: (input: {
      accountId: string;
      periodStart: string;
      periodEnd: string;
      actualClosingBalance: number;
    }) =>
      request<ReconciliationRow & { candidateCauses: string[] }>("/reconciliation/run", {
        method: "POST",
        body: input,
      }),
    resolve: (id: string, resolutionNotes?: string) =>
      request<ReconciliationRow>(`/reconciliation/${id}`, {
        method: "PATCH",
        body: { status: "RESOLVED", resolutionNotes },
      }),
  },
  analytics: {
    summary: (month: string, excludeEventIds: string[] = []) =>
      request<MonthlySummary>("/analytics/summary", {
        query: { month, excludeEventIds: excludeEventIds.join(",") || undefined },
      }),
    byBucket: (month: string, excludeEventIds: string[] = []) =>
      request<BucketTotal[]>("/analytics/by-bucket", {
        query: { month, excludeEventIds: excludeEventIds.join(",") || undefined },
      }),
    trend: (from: string, to: string, granularity: "daily" | "monthly" = "daily") =>
      request<TrendPoint[]>("/analytics/trend", { query: { from, to, granularity } }),
    insights: (month: string) =>
      request<{ insights: string[] }>("/analytics/insights", { query: { month } }),
  },
};

export interface MonthlySummary {
  month: string;
  total: { expense: number; income: number; netCashFlow: number };
  adjusted: { expense: number; income: number; netCashFlow: number };
  excludedAmount: number;
  comparison: {
    previousMonth: { expense: number; percentChange: number | null };
    threeMonthAvg: { expense: number; percentChange: number | null };
    sixMonthAvg: { expense: number; percentChange: number | null };
    twelveMonthAvg: { expense: number; percentChange: number | null };
  };
}

export interface BucketTotal {
  bucketId: string;
  bucketName: string;
  total: number;
  subBuckets: { subBucketId: string; subBucketName: string; total: number }[];
}

export interface TrendPoint {
  date: string;
  expense: number;
  income: number;
}

export interface ColumnMapping {
  date: number;
  description?: number;
  amount: number;
  direction?: number;
}

export interface ImportPreview {
  importId: string;
  headers: string[];
  suggestedMapping: ColumnMapping;
  previewRows: string[][];
  totalRows: number;
}

export interface ImportCommitResult {
  id: string;
  status: string;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  errorCount: number;
}

export interface ReconciliationRow {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  expectedClosingBalance: number;
  actualClosingBalance: number;
  difference: number;
  status: "PENDING" | "MATCHED" | "DISCREPANCY" | "RESOLVED";
  resolutionNotes: string | null;
}
