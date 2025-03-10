import type { Server, ServerOptions } from "../types.ts";
import { fmtURL, resolvePort } from "../_utils.ts";
import { wrapFetch } from "../_plugin.ts";

type DenoHandler = (
  request: Request,
  info?: Deno.ServeHandlerInfo<Deno.NetAddr>,
) => Response | Promise<Response>;

export function serve(options: ServerOptions): DenoServer {
  return new DenoServer(options);
}

// https://docs.deno.com/api/deno/~/Deno.serve

class DenoServer implements Server<DenoHandler> {
  readonly runtime = "deno";
  readonly options: ServerOptions;
  readonly deno: Server["deno"] = {};
  readonly serveOptions: Deno.ServeTcpOptions;
  readonly fetch: DenoHandler;

  #listeningPromise?: Promise<void>;
  #listeningInfo?: { hostname: string; port: number };

  constructor(options: ServerOptions) {
    this.options = options;

    const fetchHandler = wrapFetch(this, this.options.fetch);

    this.fetch = (request, info) => {
      Object.defineProperties(request, {
        deno: { value: { info, server: this.deno?.server }, enumerable: true },
        remoteAddress: {
          get: () => (info?.remoteAddr as Deno.NetAddr)?.hostname,
          enumerable: true,
        },
      });
      return fetchHandler(request);
    };

    this.serveOptions = {
      port: resolvePort(this.options.port, globalThis.Deno?.env.get("PORT")),
      hostname: this.options.hostname,
      reusePort: this.options.reusePort,
      ...this.options.deno,
    };

    if (!options.manual) {
      this.serve();
    }
  }

  serve() {
    if (this.deno?.server) {
      return Promise.resolve(this.#listeningPromise).then(() => this);
    }
    const onListenPromise = Promise.withResolvers<void>();
    this.#listeningPromise = onListenPromise.promise;
    this.deno!.server = Deno.serve(
      {
        ...this.serveOptions,
        onListen: (info) => {
          this.#listeningInfo = info;
          if (this.options.deno?.onListen) {
            this.options.deno.onListen(info);
          }
          onListenPromise.resolve();
        },
      },
      this.fetch,
    );
    return Promise.resolve(this.#listeningPromise).then(() => this);
  }

  get url() {
    return this.#listeningInfo
      ? fmtURL(this.#listeningInfo.hostname, this.#listeningInfo.port, false)
      : undefined;
  }

  ready(): Promise<Server> {
    return Promise.resolve(this.#listeningPromise).then(() => this);
  }

  close() {
    // TODO: closeAll is not supported
    return Promise.resolve(this.deno?.server?.shutdown());
  }
}
