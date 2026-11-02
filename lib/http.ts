import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}
export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}
