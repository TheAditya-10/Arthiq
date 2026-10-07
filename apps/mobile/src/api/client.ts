import type { TokenStore } from "../auth/secureTokenStore.js";

/**
 * Typed API client for apps/mobile — mirrors apps/web's `src/lib/api.ts`
 * (docs/MOBILE_ARCHITECTURE.md's "src/api/ typed fetch client (mirrors
 * apps/web's...)"), adapted for mobile's auth transport: no shared cookie
 * jar with a browser, so the refresh token travels explicitly in the
 * request/response body and `X-Client: mobile` tells the API to do the
 * same (see apps/api/src/routes/auth.ts's `isMobileClient` branch).
 */

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

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Skip the automatic refresh-and-retry-once behavior (used by /auth/refresh itself). */
  skipRefresh?: boolean;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokenStore: TokenStore;
}

export interface ApiClient {
  /**
   * Returns a usable access token, refreshing from the stored refresh token
   * first if none is cached in memory yet (e.g. a cold app start). Doesn't
   * check expiry of an already-cached token — a call made with a stale one
   * gets a 401 and the normal `request()` refresh-and-retry handles it; this
   * only exists for callers outside that path (the notification sync queue,
   * which does its own bare `fetch` — see `ingestClient.ts`).
   */
  ensureAccessToken(): Promise<string | null>;
  auth: {
    register(input: { email: string; password: string; displayName: string }): Promise<{
      accessToken: string;
      user: CurrentUser;
    }>;
    login(input: { email: string; password: string }): Promise<{
      accessToken: string;
      user: CurrentUser;
    }>;
    logout(): Promise<void>;
    me(): Promise<CurrentUser>;
  };
  accounts: {
    list(): Promise<Account[]>;
  };
  buckets: {
    list(): Promise<Bucket[]>;
  };
  subBuckets: {
    list(bucketId: string): Promise<SubBucket[]>;
  };
  people: {
    list(): Promise<Person[]>;
    get(id: string): Promise<PersonWithBalance>;
    create(input: { name: string; notes?: string }): Promise<Person>;
    addLedgerEntry(input: {
      personId: string;
      entryType: "LENT" | "BORROWED" | "REPAYMENT_RECEIVED" | "REPAYMENT_MADE";
      accountId: string;
      amount: number;
      occurredAt: string;
      notes?: string;
    }): Promise<TransactionRow>;
  };
  transactions: {
    list(query: Record<string, string | number | undefined>): Promise<TransactionListResult>;
    get(id: string): Promise<TransactionRow>;
    create(input: {
      accountId: string;
      type: string;
      amount: number;
      direction: "DEBIT" | "CREDIT";
      occurredAt: string;
      description?: string;
      merchantRaw?: string;
      bucketId?: string;
      subBucketId?: string;
    }): Promise<TransactionRow>;
    update(
      id: string,
      input: Partial<{ bucketId: string; subBucketId: string; description: string }>,
    ): Promise<TransactionRow>;
    /** One payment made for a group: your share becomes an expense, each person's share a receivable. */
    split(input: {
      accountId: string;
      amount: number;
      occurredAt: string;
      description?: string;
      merchantRaw?: string;
      bucketId?: string;
      subBucketId?: string;
      shares: { personId: string; amount: number }[];
    }): Promise<{ expense: TransactionRow | null; lent: TransactionRow[] }>;
  };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, tokenStore } = options;

  function buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(path, baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async function rawRequest<T>(path: string, requestOptions: RequestOptions = {}): Promise<T> {
    const accessToken = tokenStore.getAccessToken();
    const res = await fetch(buildUrl(path, requestOptions.query), {
      method: requestOptions.method ?? "GET",
      headers: {
        "X-Client": "mobile",
        ...(requestOptions.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: requestOptions.body !== undefined ? JSON.stringify(requestOptions.body) : undefined,
    });

    if (res.status === 204) return undefined as T;

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const error = payload?.error ?? { code: "UNKNOWN", message: res.statusText };
      throw new ApiClientError(error.message, res.status, error.code, error.details);
    }
    return payload as T;
  }

  /** Refreshes the access token using the stored refresh token. Returns the new token, or null if refresh failed. */
  async function tryRefreshAccessToken(): Promise<string | null> {
    const refreshToken = await tokenStore.getRefreshToken();
    if (!refreshToken) return null;
    try {
      const result = await rawRequest<{ accessToken: string; refreshToken: string }>(
        "/auth/refresh",
        { method: "POST", body: { refreshToken }, skipRefresh: true },
      );
      tokenStore.setAccessToken(result.accessToken);
      await tokenStore.setRefreshToken(result.refreshToken);
      return result.accessToken;
    } catch {
      tokenStore.setAccessToken(null);
      await tokenStore.setRefreshToken(null);
      return null;
    }
  }

  /** Wraps rawRequest with a single refresh-and-retry on a 401 (access token expired). */
  async function request<T>(path: string, requestOptions: RequestOptions = {}): Promise<T> {
    try {
      return await rawRequest<T>(path, requestOptions);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401 && !requestOptions.skipRefresh) {
        const refreshed = await tryRefreshAccessToken();
        if (refreshed) return rawRequest<T>(path, requestOptions);
      }
      throw err;
    }
  }

  return {
    ensureAccessToken: async () => tokenStore.getAccessToken() ?? tryRefreshAccessToken(),
    auth: {
      register: async (input) => {
        const result = await request<{
          accessToken: string;
          refreshToken: string;
          user: CurrentUser;
        }>("/auth/register", { method: "POST", body: input, skipRefresh: true });
        tokenStore.setAccessToken(result.accessToken);
        await tokenStore.setRefreshToken(result.refreshToken);
        return result;
      },
      login: async (input) => {
        const result = await request<{
          accessToken: string;
          refreshToken: string;
          user: CurrentUser;
        }>("/auth/login", { method: "POST", body: input, skipRefresh: true });
        tokenStore.setAccessToken(result.accessToken);
        await tokenStore.setRefreshToken(result.refreshToken);
        return result;
      },
      logout: async () => {
        const refreshToken = await tokenStore.getRefreshToken();
        await request<void>("/auth/logout", {
          method: "POST",
          body: refreshToken ? { refreshToken } : undefined,
          skipRefresh: true,
        }).catch(() => undefined);
        tokenStore.setAccessToken(null);
        await tokenStore.setRefreshToken(null);
      },
      me: () => request<CurrentUser>("/auth/me"),
    },
    accounts: {
      list: () => request<Account[]>("/accounts"),
    },
    buckets: {
      list: () => request<Bucket[]>("/buckets"),
    },
    subBuckets: {
      list: (bucketId) => request<SubBucket[]>("/sub-buckets", { query: { bucketId } }),
    },
    people: {
      list: () => request<Person[]>("/people"),
      get: (id) => request<PersonWithBalance>(`/people/${id}`),
      create: (input) => request<Person>("/people", { method: "POST", body: input }),
      addLedgerEntry: (input) =>
        request<TransactionRow>("/people-ledger", { method: "POST", body: input }),
    },
    transactions: {
      list: (query) => request<TransactionListResult>("/transactions", { query }),
      get: (id) => request<TransactionRow>(`/transactions/${id}`),
      create: (input) => request<TransactionRow>("/transactions", { method: "POST", body: input }),
      update: (id, input) =>
        request<TransactionRow>(`/transactions/${id}`, { method: "PATCH", body: input }),
      split: (input) =>
        request<{ expense: TransactionRow | null; lent: TransactionRow[] }>("/transactions/split", {
          method: "POST",
          body: input,
        }),
    },
  };
}
