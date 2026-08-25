import { GraphQLClient } from "graphql-request";

const API_URL = "http://localhost:4000/graphql";
const TOKEN_KEY = "sla_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveAuth(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

export function getClient(): GraphQLClient {
  const token = getToken();

  return new GraphQLClient(API_URL, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  });
}