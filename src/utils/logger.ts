import pino, { type Bindings, type Logger as PinoLogger } from 'pino';
import { redactSensitiveData } from './redaction';
import { TreeLogger, type ColorCode } from './treeLogger';

const DEFAULT_VERBOSE = process.env.LOG_VERBOSE !== 'false';
const DEFAULT_USE_COLORS = process.stdout.isTTY;

// Silent by default - use setLogLevel to enable
let CURRENT_LOG_LEVEL = 'silent';

/**
 * Structured logger using Pino
 *
 * Emits structured JSON logs for all operations while allowing
 * human-friendly representations through the TreeLogger wrapper.
 */
export const logger: PinoLogger = pino({
  level: CURRENT_LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  serializers: {
    error: pino.stdSerializers.err,
  },
});

/**
 * Enable or disable structured JSON logging
 */
export function setLogLevel(level: 'silent' | 'info' | 'debug' | 'trace' | 'warn' | 'error'): void {
  CURRENT_LOG_LEVEL = level;
  logger.level = level;
}

/**
 * Shared tree-based logger for CLI and interactive flows.
 */
export const treeLogger = new TreeLogger({
  verbose: DEFAULT_VERBOSE,
  useColors: DEFAULT_USE_COLORS,
  structuredLogger: logger,
  output: process.stderr,
});

/**
 * Create a child logger with context
 */
export function createChildLogger(context: Record<string, unknown>): pino.Logger {
  return logger.child(redactSensitiveData(context) as Bindings);
}

/**
 * Create a tree logger bound to a structured child logger.
 */
export function createTreeLogger(
  context?: Record<string, unknown>,
  options?: {
    verbose?: boolean;
    useColors?: boolean;
    output?: NodeJS.WriteStream;
    structuredLogger?: PinoLogger | false;
  }
): TreeLogger {
  const structured = options?.structuredLogger === false
    ? undefined
    : options?.structuredLogger ?? (context ? createChildLogger(context) : logger);
  return new TreeLogger({
    verbose: options?.verbose ?? DEFAULT_VERBOSE,
    useColors: options?.useColors ?? DEFAULT_USE_COLORS,
    output: options?.output ?? process.stderr,
    structuredLogger: structured,
    context,
  });
}

/**
 * Log with redaction applied
 */
export function logWithRedaction(
  level: 'info' | 'error' | 'warn' | 'debug' | 'trace',
  data: Record<string, unknown>
): void {
  const redacted = redactSensitiveData(data);
  switch (level) {
    case 'info':
      logger.info(redacted);
      break;
    case 'error':
      logger.error(redacted);
      break;
    case 'warn':
      logger.warn(redacted);
      break;
    case 'debug':
      logger.debug(redacted);
      break;
    case 'trace':
      logger.trace(redacted);
      break;
  }
}

/**
 * Quick access helpers mirroring the Python logger API.
 */
export const tree = {
  debug: (message: string) => treeLogger.debug(message),
  info: (message: string) => treeLogger.info(message),
  success: (message: string) => treeLogger.success(message),
  warning: (message: string) => treeLogger.warning(message),
  error: (message: string) => treeLogger.error(message),
  section: (title: string) => treeLogger.section(title),
  separator: () => treeLogger.separator(),
  newline: () => treeLogger.newline(),
  root: (message: string, color?: ColorCode) => treeLogger.treeRoot(message, color),
  node: (message: string, last = false, color?: ColorCode) => treeLogger.treeNode(message, last, color),
  leaf: (message: string, color?: ColorCode) => treeLogger.treeLeaf(message, color),
  item: (message: string, last = false, color?: ColorCode) => treeLogger.treeItem(message, last, color),
  up: () => treeLogger.treeUp(),
  close: () => treeLogger.treeClose(),
  metric: (label: string, value: string | number, unit = '', color?: ColorCode) => treeLogger.metric(label, value, unit, color),
  keyValue: (key: string, value: unknown, color?: ColorCode) => treeLogger.keyValue(key, value, color),
  progress: (current: number, total: number, label?: string) => treeLogger.progress(current, total, label),
  progressComplete: () => treeLogger.progressComplete(),
  codeBlock: (code: string, language?: string) => treeLogger.codeBlock(code, language),
  list: (items: Array<string | number>, numbered = false) => treeLogger.listItems(items, numbered),
};

export type { TreeLogger, ColorCode };

