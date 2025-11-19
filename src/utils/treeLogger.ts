/* eslint-disable @typescript-eslint/no-this-alias */
import type { Logger as PinoLogger } from 'pino';

export enum TreeLogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

export const Colors = {
  RESET: '\u001b[0m',
  BOLD: '\u001b[1m',
  DIM: '\u001b[2m',
  BLACK: '\u001b[30m',
  RED: '\u001b[31m',
  GREEN: '\u001b[32m',
  YELLOW: '\u001b[33m',
  BLUE: '\u001b[34m',
  MAGENTA: '\u001b[35m',
  CYAN: '\u001b[36m',
  WHITE: '\u001b[37m',
  BRIGHT_BLACK: '\u001b[90m',
  BRIGHT_RED: '\u001b[91m',
  BRIGHT_GREEN: '\u001b[92m',
  BRIGHT_YELLOW: '\u001b[93m',
  BRIGHT_BLUE: '\u001b[94m',
  BRIGHT_MAGENTA: '\u001b[95m',
  BRIGHT_CYAN: '\u001b[96m',
  BRIGHT_WHITE: '\u001b[97m',
  BG_RED: '\u001b[41m',
  BG_GREEN: '\u001b[42m',
  BG_YELLOW: '\u001b[43m',
  BG_BLUE: '\u001b[44m',
} as const;

export type ColorCode = (typeof Colors)[keyof typeof Colors];

interface TreeLoggerOptions {
  verbose?: boolean;
  useColors?: boolean;
  indentLevel?: number;
  structuredLogger?: PinoLogger;
  output?: NodeJS.WriteStream;
  context?: Record<string, unknown>;
}

interface TreeStackItem {
  raw: string;
  colored: string;
}

const DEFAULT_SEPARATOR_WIDTH = 70;
const ANSI_REGEX = new RegExp(String.raw`\u001b\[[0-9;]*m`, 'g');
const TREE_CHAR_NORMALIZATION: Record<string, string> = {
  '┌': '|',
  '├': '|',
  '└': '|',
  '│': '|',
  '─': '-',
  '═': '=',
};

// Global active logger instance for shared tree context
let activeTreeLogger: TreeLogger | null = null;

function normalizeTreeChars(value: string): string {
  let normalized = '';
  for (const char of value) {
    normalized += TREE_CHAR_NORMALIZATION[char] ?? char;
  }
  return normalized;
}

/**
 * Tree-aware logger with ANSI color support and optional structured logging via Pino.
 */
export class TreeLogger {
  private verbose: boolean;
  private useColors: boolean;
  private indentLevel: number;
  private treeStack: TreeStackItem[] = [];
  private treeColor?: ColorCode;
  private structuredLogger?: PinoLogger;
  private output: NodeJS.WriteStream;

  constructor(options: TreeLoggerOptions = {}) {
    this.verbose = options.verbose ?? true;
    this.useColors = options.useColors ?? process.stdout.isTTY;
    this.indentLevel = options.indentLevel ?? 0;
    this.treeColor = undefined;
    this.structuredLogger = options.structuredLogger;
    this.output = options.output ?? process.stderr;
    
    // If this is the first logger created, make it active
    if (!activeTreeLogger) {
      activeTreeLogger = this;
    }
  }

  /**
   * Sets this logger as the active logger for shared tree context
   */
  setActive(): void {
    activeTreeLogger = this;
  }

  /**
   * Gets the active logger's tree context
   */
  private getActiveTreeContext(): { prefix: string; symbol: string; color?: ColorCode } | null {
    if (activeTreeLogger && activeTreeLogger !== this && activeTreeLogger.treeStack.length > 0) {
      const prefix = activeTreeLogger.getTreePathColoredInternal();
      const symbol = activeTreeLogger.colorizeInternal('├─', activeTreeLogger.treeColor ?? Colors.CYAN);
      return { prefix, symbol, color: activeTreeLogger.treeColor };
    }
    return null;
  }

  /**
   * Internal method to get tree path (for sharing context)
   */
  private getTreePathColoredInternal(): string {
    return this.getTreePathColored();
  }

  /**
   * Internal method to colorize (for sharing context)
   */
  private colorizeInternal(text: string, color: ColorCode): string {
    return this.colorize(text, color);
  }

  setStructuredLogger(logger: PinoLogger): void {
    this.structuredLogger = logger;
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  setUseColors(useColors: boolean): void {
    this.useColors = useColors;
  }

  setOutput(output: NodeJS.WriteStream): void {
    this.output = output;
  }

  // ===== Basic logging methods =====

  debug(message: string): void;
  debug(metadata: Record<string, unknown>, message: string): void;
  debug(messageOrMetadata: string | Record<string, unknown>, message?: string): void {
    const msg = typeof messageOrMetadata === 'string' ? messageOrMetadata : message!;
    const metadata = typeof messageOrMetadata === 'object' ? messageOrMetadata : undefined;
    
    // Check if there's an active tree context from another logger
    const activeContext = this.getActiveTreeContext();
    const prefix = activeContext?.prefix ?? this.getTreePathColored();
    const symbol = activeContext?.symbol ?? (this.treeStack.length > 0 
      ? this.colorize('├─', this.treeColor ?? Colors.DIM)
      : '   ');
    
    const formatted = this.colorize(`${prefix}${symbol} ${msg}`, Colors.DIM);
    this.print(formatted);
    this.logStructured('debug', msg, metadata);
  }

  info(message: string): void;
  info(metadata: Record<string, unknown>, message: string): void;
  info(messageOrMetadata: string | Record<string, unknown>, message?: string): void {
    const msg = typeof messageOrMetadata === 'string' ? messageOrMetadata : message!;
    const metadata = typeof messageOrMetadata === 'object' ? messageOrMetadata : undefined;
    
    // Check if there's an active tree context from another logger
    const activeContext = this.getActiveTreeContext();
    const prefix = activeContext?.prefix ?? this.getTreePathColored();
    const symbol = activeContext?.symbol ?? (this.treeStack.length > 0 
      ? this.colorize('├─', this.treeColor ?? Colors.CYAN)
      : '   ');
    
    const formatted = this.colorize(`${prefix}${symbol} ${msg}`, Colors.CYAN);
    this.print(formatted);
    this.logStructured('info', msg, metadata);
  }

  success(message: string): void {
    // Check if there's an active tree context from another logger
    const activeContext = this.getActiveTreeContext();
    const prefix = activeContext?.prefix ?? this.getTreePathColored();
    const symbol = activeContext?.symbol ?? (this.treeStack.length > 0 
      ? this.colorize('├─', this.treeColor ?? Colors.BRIGHT_GREEN)
      : '');
    const formatted = this.colorize(`${prefix}${symbol}${symbol ? ' ' : ''}✅ ${message}`, Colors.BRIGHT_GREEN);
    this.print(formatted);
    this.logStructured('info', message, { success: true });
  }

  warning(message: string): void;
  warning(metadata: Record<string, unknown>, message: string): void;
  warning(messageOrMetadata: string | Record<string, unknown>, message?: string): void {
    const msg = typeof messageOrMetadata === 'string' ? messageOrMetadata : message!;
    const metadata = typeof messageOrMetadata === 'object' ? messageOrMetadata : undefined;
    
    // Check if there's an active tree context from another logger
    const activeContext = this.getActiveTreeContext();
    const prefix = activeContext?.prefix ?? this.getTreePathColored();
    const symbol = activeContext?.symbol ?? (this.treeStack.length > 0 
      ? this.colorize('├─', this.treeColor ?? Colors.BRIGHT_YELLOW)
      : '');
    const formatted = this.colorize(`${prefix}${symbol}${symbol ? ' ' : ''}⚠️  ${msg}`, Colors.BRIGHT_YELLOW);
    this.print(formatted);
    this.logStructured('warn', msg, metadata);
  }

  // Alias for Pino compatibility
  warn(message: string): void;
  warn(metadata: Record<string, unknown>, message: string): void;
  warn(messageOrMetadata: string | Record<string, unknown>, message?: string): void {
    if (typeof messageOrMetadata === 'string') {
      this.warning(messageOrMetadata);
    } else {
      this.warning(messageOrMetadata, message!);
    }
  }

  error(message: string): void;
  error(metadata: Record<string, unknown>, message: string): void;
  error(messageOrMetadata: string | Record<string, unknown>, message?: string): void {
    const msg = typeof messageOrMetadata === 'string' ? messageOrMetadata : message!;
    const metadata = typeof messageOrMetadata === 'object' ? messageOrMetadata : undefined;
    
    // Check if there's an active tree context from another logger
    const activeContext = this.getActiveTreeContext();
    const prefix = activeContext?.prefix ?? this.getTreePathColored();
    const symbol = activeContext?.symbol ?? (this.treeStack.length > 0 
      ? this.colorize('├─', this.treeColor ?? Colors.BRIGHT_RED)
      : '');
    const formatted = this.colorize(`${prefix}${symbol}${symbol ? ' ' : ''}❌ ${msg}`, Colors.BRIGHT_RED);
    this.print(formatted);
    this.logStructured('error', msg, metadata);
  }

  // ===== Section helpers =====

  section(title: string): void {
    const separator = '═'.repeat(DEFAULT_SEPARATOR_WIDTH);
    const coloredTitle = this.colorize(`🎯 ${title}`, (Colors.BOLD + Colors.BRIGHT_CYAN) as ColorCode);
    this.print(`\n${separator}`);
    this.print(coloredTitle);
    this.print(separator);
    this.logStructured('info', title, { section: true });
  }

  separator(): void {
    this.print('─'.repeat(DEFAULT_SEPARATOR_WIDTH));
  }

  newline(): void {
    if (!this.verbose) {
      return;
    }
    this.output.write('\n');
  }

  // ===== Tree structure methods =====

  treeRoot(message: string, color?: ColorCode): void {
    this.treeColor = color ?? Colors.BRIGHT_CYAN;
    const coloredMsg = this.colorize(`┌─ ${message}`, this.treeColor);
    this.print(coloredMsg);
    const segment: TreeStackItem = {
      raw: '│',
      colored: this.colorize('│', this.treeColor),
    };
    this.treeStack = [segment];
    this.logStructured('info', message, { treeEvent: 'root', treePath: this.getTreePathRaw() });
  }

  treeNode(message: string, last = false, color?: ColorCode): void {
    const nodeColor = color ?? this.treeColor ?? Colors.CYAN;
    const prefix = this.getTreePathColored();

    let symbol: string;
    if (last) {
      symbol = this.colorize('└─', nodeColor);
      this.treeStack.push({ raw: '   ', colored: '   ' });
    } else {
      symbol = this.colorize('├─', nodeColor);
      const segment: TreeStackItem = {
        raw: '│  ',
        colored: this.colorize('│', nodeColor) + '  ',
      };
      this.treeStack.push(segment);
    }

    const coloredMsg = this.colorize(message, nodeColor);
    this.print(`${prefix}${symbol} ${coloredMsg}`);
    this.logStructured('info', message, {
      treeEvent: 'node',
      treePath: this.getTreePathRaw(),
      last,
    });
  }

  treeLeaf(message: string, color?: ColorCode): void {
    const leafColor = color ?? this.treeColor ?? Colors.WHITE;
    const prefix = this.getTreePathColored();
    const symbol = this.colorize('└─', leafColor);
    const coloredMsg = this.colorize(message, leafColor);
    const rawPath = this.getTreePathRaw();
    this.print(`${prefix}${symbol} ${coloredMsg}`);
    if (this.treeStack.length > 0) {
      this.treeStack.pop();
    }
    this.logStructured('info', message, {
      treeEvent: 'leaf',
      treePath: rawPath,
    });
  }

  treeItem(message: string, last = false, color?: ColorCode): void {
    const itemColor = color ?? this.treeColor ?? Colors.WHITE;
    const prefix = this.getTreePathColored();
    const symbol = this.colorize(last ? '└─' : '├─', itemColor);
    const coloredMsg = this.colorize(message, itemColor);
    this.print(`${prefix}${symbol} ${coloredMsg}`);
    this.logStructured('info', message, {
      treeEvent: 'item',
      treePath: this.getTreePathRaw(),
      last,
    });
  }

  treeUp(): void {
    if (this.treeStack.length > 0) {
      this.treeStack.pop();
    }
  }

  treeClose(): void {
    this.treeStack = [];
    this.treeColor = undefined;
  }

  // ===== Specialized helpers =====

  metric(label: string, value: string | number, unit = '', color?: ColorCode): void {
    const metricColor = color ?? Colors.BRIGHT_YELLOW;
    const coloredValue = this.colorize(`${value}${unit}`, metricColor);
    const prefix = this.getTreePathColored();
    const symbol = this.treeStack.length > 0
      ? this.colorize('├─', this.treeColor ?? Colors.WHITE)
      : '├─';
    this.print(`${prefix}${symbol} ${label}: ${coloredValue}`);
    this.logStructured('info', `${label}: ${value}${unit}`, {
      treeEvent: 'metric',
      treePath: this.getTreePathRaw(),
      label,
      value,
      unit,
    });
  }

  progress(current: number, total: number, label = 'Progresso'): void {
    if (!this.verbose) {
      return;
    }

    const percentage = total > 0 ? (current / total) * 100 : 0;
    const barLength = 30;
    const filled = total > 0 ? Math.floor((barLength * current) / total) : 0;
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    const coloredBar = this.colorize(bar, Colors.BRIGHT_GREEN);
    
    // Check if there's an active tree context from another logger
    const activeContext = this.getActiveTreeContext();
    const prefix = activeContext?.prefix ?? this.getTreePathColored();
    const symbol = activeContext?.symbol ?? (this.treeStack.length > 0
      ? this.colorize('├─', this.treeColor ?? Colors.WHITE)
      : '├─');
    const message = `${prefix}${symbol} ${label}: ${coloredBar} ${percentage.toFixed(1)}% (${current}/${total})`;
    this.output.write(`\r${message}`);
  }

  progressComplete(): void {
    if (!this.verbose) {
      return;
    }
    this.output.write('\n');
  }

  keyValue(key: string, value: unknown, color?: ColorCode): void {
    const valueColor = color ?? Colors.WHITE;
    const coloredKey = this.colorize(key, Colors.BRIGHT_CYAN);
    const coloredValue = this.colorize(String(value), valueColor);
    const prefix = this.getTreePathColored();
    const symbol = this.treeStack.length > 0
      ? this.colorize('├─', this.treeColor ?? Colors.WHITE)
      : '├─';
    this.print(`${prefix}${symbol} ${coloredKey}: ${coloredValue}`);
    this.logStructured('info', `${key}: ${value}`, {
      treeEvent: 'key_value',
      treePath: this.getTreePathRaw(),
      key,
      value,
    });
  }

  codeBlock(code: string, language = ''): void {
    const prefix = this.getTreePathColored();
    const blockColor = this.treeColor ?? Colors.WHITE;
    const top = this.colorize('┌─', blockColor);
    const mid = this.colorize('│', blockColor);
    const bottom = this.colorize('└─', blockColor);

    this.print(`${prefix}${top} Código (${language})`);
    for (const line of code.split('\n')) {
      const coloredLine = this.colorize(`  ${line}`, Colors.DIM);
      this.print(`${prefix}${mid}${coloredLine}`);
    }
    this.print(`${prefix}${bottom}`);
    this.logStructured('info', 'code_block', {
      treeEvent: 'code_block',
      treePath: this.getTreePathRaw(),
      language,
      lineCount: code.split('\n').length,
    });
  }

  listItems(items: Array<string | number>, numbered = false): void {
    const prefix = this.getTreePathColored();
    const treeSymbol = this.treeStack.length > 0
      ? this.colorize('├─', this.treeColor ?? Colors.WHITE)
      : '├─';

    items.forEach((item, index) => {
      const symbol = numbered ? `${index + 1}.` : '•';
      this.print(`${prefix}${treeSymbol} ${symbol} ${item}`);
    });

    this.logStructured('info', 'list_items', {
      treeEvent: 'list_items',
      treePath: this.getTreePathRaw(),
      count: items.length,
      numbered,
    });
  }

  // ===== Internal helpers =====

  private colorize(text: string, color: ColorCode): string {
    if (!this.useColors) {
      return text;
    }
    return `${color}${text}${Colors.RESET}`;
  }

  private print(message: string): void {
    if (!this.verbose) {
      return;
    }
    const indent = ' '.repeat(this.indentLevel);
    this.output.write(`${indent}${message}\n`);
  }

  private logStructured(level: 'info' | 'error' | 'warn' | 'debug', message: string, extra?: Record<string, unknown>): void {
    if (!this.structuredLogger) {
      return;
    }

    const payload = {
      msg: message,
      treePath: this.getTreePathRaw(),
      ...extra,
    };

    const loggerMethod = this.structuredLogger[level].bind(this.structuredLogger);
    loggerMethod(payload);
  }

  private getTreePathColored(): string {
    return this.treeStack.map((segment) => segment.colored).join('');
  }

  private getTreePathRaw(): string | undefined {
    if (this.treeStack.length === 0) {
      return undefined;
    }
    const raw = this.treeStack.map((segment) => segment.raw).join('');
    const cleaned = raw.replace(ANSI_REGEX, '');
    const normalized = normalizeTreeChars(cleaned);
    return normalized || undefined;
  }
}

