interface D1Result<T = unknown> { results: T[]; success: boolean; meta?: unknown; }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
interface R2HTTPMetadata { contentType?: string; }
interface R2ObjectBody { body: ReadableStream; writeHttpMetadata(headers: Headers): void; }
interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null, options?: { httpMetadata?: R2HTTPMetadata }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}
interface Fetcher { fetch(input: Request | string, init?: RequestInit): Promise<Response>; }
