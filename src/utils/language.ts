import * as path from 'path';

const LANGUAGE_ALIASES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'python',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  hh: 'cpp',
  c: 'c',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  scala: 'scala',
  sh: 'bash',
  bash: 'bash',
  ps1: 'powershell',
  sql: 'sql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  md: 'markdown',
  txt: 'text',
};

export function inferLanguageFromFilePath(filePath?: string): string | undefined {
  if (!filePath) {
    return undefined;
  }

  const extension = path.extname(filePath).toLowerCase();

  if (!extension) {
    return undefined;
  }

  const normalizedExtension = extension.replace('.', '');

  if (!normalizedExtension) {
    return undefined;
  }

  return LANGUAGE_ALIASES[normalizedExtension] || normalizedExtension;
}

