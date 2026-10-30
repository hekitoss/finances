import { vi } from "vitest";
import type { Transaction } from "../../src/types";
import { DICTIONARIES, ITEMS, TRANSACTIONS, formData } from "../fixtures";

export interface RecordedRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
}

interface FakeApiOptions {
  transactions?: Transaction[];
  /** Answers a request before the defaults; return undefined to fall through. */
  override?: (request: RecordedRequest) => Response | Promise<Response> | undefined;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Replaces fetch with an in-memory backend; every request is recorded for assertions. */
export function installFakeApi({ transactions = TRANSACTIONS, override }: FakeApiOptions = {}) {
  const requests: RecordedRequest[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const request: RecordedRequest = {
      method: (init?.method ?? "GET").toUpperCase(),
      path: url.pathname,
      search: url.searchParams,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    };
    requests.push(request);

    const overridden = override?.(request);
    if (overridden) {
      return overridden;
    }

    const { method, path } = request;
    if (method === "GET" && path === "/api/transactions") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      return json(transactions.filter((t) => !from || !to || (t.transactionDate >= from && t.transactionDate <= to)));
    }
    if (method === "GET" && path === "/api/dictionaries") {
      return json(DICTIONARIES);
    }
    if (method === "GET" && path === "/api/transactions/export") {
      return new Response(new Blob(["xlsx"]), {
        headers: { "content-disposition": 'attachment; filename="report.xlsx"' }
      });
    }
    const itemsMatch = path.match(/^\/api\/transactions\/(\d+)\/items$/);
    if (method === "GET" && itemsMatch) {
      return json(ITEMS[Number(itemsMatch[1])] ?? []);
    }
    const idMatch = path.match(/^\/api\/transactions\/(\d+)$/);
    if (idMatch) {
      const id = Number(idMatch[1]);
      if (method === "GET") {
        return json(formData(id));
      }
      if (method === "PUT") {
        return json({ ...transactions.find((t) => t.id === id) });
      }
      if (method === "DELETE") {
        return new Response(null, { status: 204 });
      }
    }
    return json({ error: `Unexpected ${method} ${path}` }, 404);
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    requests,
    /** Requests to one endpoint, e.g. calls("GET", "/api/dictionaries"). */
    calls: (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path)
  };
}
