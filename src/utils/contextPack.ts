import type { SemanticSearchResult } from '../models/RAGQuery';

/**
 * Format search results as a context pack for LLM consumption
 */
export function formatContextPack(
  query: string,
  results: SemanticSearchResult[]
): string {
  const lines: string[] = [];

  lines.push(`# Context Pack`);
  lines.push(`> Query: ${query}`);
  lines.push(`> Results: ${results.length}`);
  lines.push('');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const repo = r.metadata.repo || 'unknown';
    const score = (r.similarity * 100).toFixed(1);
    const source = r.source || 'hybrid';

    lines.push(`## [${i + 1}] ${r.filePath}:${r.metadata.startLine}-${r.metadata.endLine}`);
    lines.push(`repo=${repo} lang=${r.metadata.language} score=${score}% source=${source}`);

    if (r.metadata.symbol) {
      lines.push(`symbol=${r.metadata.symbol} type=${r.metadata.chunkType || 'unknown'}`);
    }

    lines.push('');
    lines.push('```' + (r.metadata.language || ''));
    lines.push(r.content);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}
