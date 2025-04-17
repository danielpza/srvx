import type { ErrorHandler, ServerHandler, ServerOptions } from "./types";

import { readFileSync } from "node:fs";

export function resolvePort(
  portOptions: string | number | undefined,
  portEnv: string | undefined,
): number {
  const portInput = portOptions ?? portEnv;
  if (portInput === undefined) {
    return 3000;
  }
  return typeof portInput === "number"
    ? portInput
    : Number.parseInt(portInput, 10);
}

export function fmtURL(
  host: string | undefined,
  port: number | undefined,
  secure: boolean,
) {
  if (!host || !port) {
    return undefined;
  }
  if (host.includes(":")) {
    host = `[${host}]`;
  }
  return `http${secure ? "s" : ""}://${host}:${port}/`;
}

export function resolveTLSOptions(opts: ServerOptions) {
  if (!opts.tls || opts.protocol === "http") {
    return;
  }
  const cert = resolveCertOrKey(opts.tls.cert);
  const key = resolveCertOrKey(opts.tls.key);
  if (!cert && !key) {
    if (opts.protocol === "https") {
      throw new TypeError(
        "TLS `cert` and `key` must be provided for `https` protocol.",
      );
    }
    return;
  }
  if (!cert || !key) {
    throw new TypeError("TLS `cert` and `key` must be provided together.");
  }
  return {
    cert,
    key,
    passphrase: opts.tls.passphrase,
  };
}

function resolveCertOrKey(value?: unknown): undefined | string {
  if (!value) {
    return;
  }
  if (typeof value !== "string") {
    throw new TypeError(
      "TLS certificate and key must be strings in PEM format or file paths.",
    );
  }
  if (value.startsWith("-----BEGIN ")) {
    return value;
  }
  return readFileSync(value, "utf8");
}

export function wrapFetchOnError(
  fetchHandler: ServerHandler,
  onError?: ErrorHandler,
): ServerHandler {
  if (!onError) return fetchHandler;
  return (...params) => {
    try {
      const result = fetchHandler(...params);
      if (result instanceof Promise) {
        return result.catch(onError);
      }
      return result;
    } catch (error) {
      return onError(error as Error);
    }
  };
}
