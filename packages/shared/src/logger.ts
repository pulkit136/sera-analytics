export type LogMethod = (message: string, meta?: Record<string, unknown>) => void;

export interface Logger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

class ConsoleLogger implements Logger {
  private levelValue(lvl: string): number {
    switch (lvl) {
      case "debug":
        return 0;
      case "info":
        return 1;
      case "warn":
        return 2;
      case "error":
        return 3;
      default:
        return 1;
    }
  }

  private shouldLog(lvl: string): boolean {
    const currentLevel = process.env.LOG_LEVEL || "info";
    return this.levelValue(lvl) >= this.levelValue(currentLevel);
  }

  private write(level: string, message: string, meta?: Record<string, unknown>) {
    if (!this.shouldLog(level)) {
      return;
    }
    const logObject = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };
    if (level === "error") {
      console.error(JSON.stringify(logObject));
    } else if (level === "warn") {
      console.warn(JSON.stringify(logObject));
    } else {
      console.log(JSON.stringify(logObject));
    }
  }

  public debug(message: string, meta?: Record<string, unknown>) {
    this.write("debug", message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>) {
    this.write("info", message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>) {
    this.write("warn", message, meta);
  }

  public error(message: string, meta?: Record<string, unknown>) {
    this.write("error", message, meta);
  }
}

export const logger: Logger = new ConsoleLogger();
