declare module "node:fs" {
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function readFileSync(path: string, encoding: BufferEncoding): string;
  export function writeFileSync(
    path: string,
    data: string | Uint8Array,
    encoding?: BufferEncoding
  ): void;
}

declare module "node:path" {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function dirname(p: string): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

type BufferEncoding = "utf-8" | "utf8" | "ascii" | "binary";
