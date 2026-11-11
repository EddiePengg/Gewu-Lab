import type { Card, CardInput, Workspace } from "./types";

export const API_URL = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "gewu-api-token";

export function getApiToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function clearApiToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function authorizedFetch(input: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const token = getApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(input, { ...options, headers });
  if (response.status === 401) {
    clearApiToken();
    window.dispatchEvent(new Event("gewu:unauthorized"));
  }
  return response;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await authorizedFetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || "请求失败，请稍后重试");
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function authenticate(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  try {
    await request<Workspace[]>("/workspaces");
  } catch (error) {
    clearApiToken();
    throw error;
  }
}

export const api = {
  listWorkspaces: () => request<Workspace[]>("/workspaces"),
  createWorkspace: (input: Pick<Workspace, "name" | "description" | "color">) =>
    request<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(input) }),
  listCards: (workspaceId: number, query: string) => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    return request<Card[]>(`/workspaces/${workspaceId}/cards?${params}`);
  },
  getCard: (cardId: number) => request<Card>(`/cards/${cardId}`),
  viewCard: (cardId: number) => request<Card>(`/cards/${cardId}/view`, { method: "POST" }),
  createCard: (workspaceId: number, input: CardInput) =>
    request<Card>(`/workspaces/${workspaceId}/cards`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateCard: (cardId: number, input: CardInput) =>
    request<Card>(`/cards/${cardId}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteCard: (cardId: number) => request<void>(`/cards/${cardId}`, { method: "DELETE" }),
};
