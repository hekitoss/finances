import type {
  CategoryCreateRequest,
  DictionariesResponse,
  NamedDictionaryItem,
  SubcategoryCreateRequest,
  SubcategoryDictionaryItem,
  Transaction,
  TransactionCreateRequest,
  TransactionFormData
} from "./types";

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await response.json()) as { error?: string };
    if (body.error) {
      return body.error;
    }
  }

  return `${fallback}: HTTP ${response.status}`;
}

export async function fetchTransactions(period?: { month: number; year: number }): Promise<Transaction[]> {
  const searchParams = new URLSearchParams();

  if (period) {
    searchParams.set("month", String(period.month));
    searchParams.set("year", String(period.year));
  }

  const query = searchParams.toString();
  const url = query ? `/api/transactions?${query}` : "/api/transactions";

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to load transactions"));
  }

  const data = (await response.json()) as Transaction[];
  return data;
}

export async function fetchTransaction(id: number): Promise<TransactionFormData> {
  const response = await fetch(`/api/transactions/${id}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to load transaction"));
  }

  const data = (await response.json()) as TransactionFormData;
  return data;
}

export async function fetchDictionaries(): Promise<DictionariesResponse> {
  const response = await fetch("/api/dictionaries", {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to load dictionaries"));
  }

  const data = (await response.json()) as DictionariesResponse;
  return data;
}

export async function createTransaction(payload: TransactionCreateRequest): Promise<Transaction> {
  const response = await fetch("/api/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to create transaction"));
  }

  const data = (await response.json()) as Transaction;
  return data;
}

export async function updateTransaction(id: number, payload: TransactionCreateRequest): Promise<Transaction> {
  const response = await fetch(`/api/transactions/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to update transaction"));
  }

  const data = (await response.json()) as Transaction;
  return data;
}

export async function createCategory(payload: CategoryCreateRequest): Promise<NamedDictionaryItem> {
  const response = await fetch("/api/categories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to create category"));
  }

  const data = (await response.json()) as NamedDictionaryItem;
  return data;
}

export async function createSubcategory(payload: SubcategoryCreateRequest): Promise<SubcategoryDictionaryItem> {
  const response = await fetch("/api/subcategories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to create subcategory"));
  }

  const data = (await response.json()) as SubcategoryDictionaryItem;
  return data;
}

export async function deleteTransaction(id: number): Promise<void> {
  const response = await fetch(`/api/transactions/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to delete transaction"));
  }
}
