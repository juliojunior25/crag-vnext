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
  toml: 'toml',
  py: 'python',
  pyi: 'python',
  pyx: 'python',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
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
  zsh: 'bash',
  ps1: 'powershell',
  sql: 'sql',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sass: 'sass',
  md: 'markdown',
  mdx: 'markdown',
  txt: 'text',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  zig: 'zig',
  lua: 'lua',
  r: 'r',
  R: 'r',
  tf: 'terraform',
  proto: 'protobuf',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
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

