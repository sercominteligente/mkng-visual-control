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
interface R2HTTPMetadata { contentType?: string; cacheControl?: string; contentDisposition?: string; }
interface R2ObjectBody { body: ReadableStream; httpEtag: string; writeHttpMetadata(headers: Headers): void; }
interface R2PutOptions { httpMetadata?: R2HTTPMetadata; customMetadata?: Record<string, string>; }
interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null, options?: R2PutOptions): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}
interface Fetcher { fetch(input: Request | string, init?: RequestInit): Promise<Response>; }
interface Body { json<T = any>(): Promise<T>; }
