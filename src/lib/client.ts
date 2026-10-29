"use client";

import type { Issue } from "@/domain/types";

export class ApiError extends Error {
  constructor(message: string, public status: number, public issues: Issue[] = []) {
    super(message);
  }
}

/** JSON (or FormData) fetch to our Route Handlers. Throws ApiError carrying any rule violations. */
export async function api<T = unknown>(url: string, method = "POST", body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !url.includes("/auth/")) {
    window.location.href = "/login";
  }
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.issues ?? []);
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
