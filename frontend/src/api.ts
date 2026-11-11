import type { Card, CardInput, Workspace } from "./types";

const API_URL = import.meta.env.VITE_API_URL || "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
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
