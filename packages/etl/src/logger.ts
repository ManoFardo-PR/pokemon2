import pinoModule, { type Logger, type DestinationStream } from "pino";

const pino = (
  typeof pinoModule === "function"
    ? pinoModule
    : (pinoModule as unknown as { default: typeof pinoModule }).default
) as unknown as typeof pinoModule;

export interface LoggerOptions {
  json?: boolean | undefined;
  verbose?: boolean | undefined;
}

export const REDACTED_KEYS = /key|token|secret/i;

function maskSensitive(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(maskSensitive);
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.test(k)) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = maskSensitive(v);
    }
  }
  return result;
}

export function createEtlLogger(
  options?: LoggerOptions,
  destination?: DestinationStream
): Logger {
  const isJson = options?.json ?? false;
  const level = options?.verbose ? "debug" : "info";

  if (isJson) {
    return pino(
      {
        level,
        formatters: {
          log(object) {
            return maskSensitive(object) as Record<string, unknown>;
          },
        },
      },
      destination
    );
  }

  const stream: DestinationStream = destination ?? process.stdout;

  const writeHuman = (levelName: string, obj: unknown, msg?: string): void => {
    const timestamp = new Date().toISOString();
    let step = "";
    let messageText = msg ?? "";

    if (obj && typeof obj === "object") {
      const record = maskSensitive(obj) as Record<string, unknown>;
      if (typeof record.step === "string") {
        step = record.step;
      }
      if (!messageText && typeof record.msg === "string") {
        messageText = record.msg;
      }
    }

    const prefix = step ? `${step}: ` : "";
    const line = `${timestamp} ${levelName.toUpperCase()} ${prefix}${messageText}\n`;
    stream.write(line);
  };

  const humanLogger = {
    level,
    info(arg1: unknown, arg2?: unknown): void {
      if (typeof arg1 === "string") {
        writeHuman("info", undefined, arg1);
      } else {
        writeHuman("info", arg1, typeof arg2 === "string" ? arg2 : undefined);
      }
    },
    error(arg1: unknown, arg2?: unknown): void {
      if (typeof arg1 === "string") {
        writeHuman("error", undefined, arg1);
      } else {
        writeHuman("error", arg1, typeof arg2 === "string" ? arg2 : undefined);
      }
    },
    warn(arg1: unknown, arg2?: unknown): void {
      if (typeof arg1 === "string") {
        writeHuman("warn", undefined, arg1);
      } else {
        writeHuman("warn", arg1, typeof arg2 === "string" ? arg2 : undefined);
      }
    },
    debug(arg1: unknown, arg2?: unknown): void {
      if (typeof arg1 === "string") {
        writeHuman("debug", undefined, arg1);
      } else {
        writeHuman("debug", arg1, typeof arg2 === "string" ? arg2 : undefined);
      }
    },
    child() {
      return humanLogger;
    },
  } as unknown as Logger;

  return humanLogger;
}
