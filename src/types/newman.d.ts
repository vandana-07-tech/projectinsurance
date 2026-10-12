declare module "newman" {
  interface NewmanRunOptions {
    collection: string | object;
    environment?: string | object;
    envVar?: Array<{ key: string; value: string }>;
    reporters?: string | string[];
    reporter?: Record<string, unknown>;
    timeout?: number;
    timeoutRequest?: number;
    insecure?: boolean;
  }

  interface NewmanSummary {
    run: {
      failures?: unknown[];
      executions?: Array<{
        item?: { name?: string };
        request?: {
          body?: { raw?: string };
          headers?: Array<{ key: string; value: string }>;
        };
        response?: {
          code?: number;
          responseTime?: number;
          stream?: Buffer | Uint8Array;
        };
        requestError?: { message?: string };
        assertions?: Array<{
          assertion: string;
          error?: { message?: string };
        }>;
      }>;
    };
  }

  interface NewmanRun {
    on(event: string, cb: (...args: unknown[]) => void): NewmanRun;
    abort?: () => void;
  }

  function run(
    options: NewmanRunOptions,
    callback: (err: Error | null, summary: NewmanSummary) => void
  ): NewmanRun;

  const newman: { run: typeof run };
  export default newman;
}
