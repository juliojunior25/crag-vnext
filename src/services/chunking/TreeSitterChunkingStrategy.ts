import { createHash } from 'crypto';
import type { IChunkingStrategy } from '../../interfaces/IChunkingStrategy';
import type { CodeChunk } from '../../models/CodeChunk';

// Tree-sitter imports
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

// Tree-sitter queries for extracting top-level definitions
const TS_QUERIES: Record<string, string[]> = {
  typescript: [
    'function_declaration',
    'method_definition',
    'class_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration',
    'export_statement',
    'lexical_declaration',
  ],
  javascript: [
    'function_declaration',
    'method_definition',
    'class_declaration',
    'export_statement',
    'lexical_declaration',
  ],
};

interface ExtractedBlock {
  content: string;
  startLine: number;
  endLine: number;
  symbol: string;
  chunkType: CodeChunk['chunkType'];
}

/**
 * Tree-sitter based chunking strategy
 * Uses real AST parsing for TypeScript/JavaScript
 * Falls back to regex-based extraction for unsupported languages
 */
export class TreeSitterChunkingStrategy implements IChunkingStrategy {
  readonly name = 'tree-sitter';

  private parser: Parser;
  private maxChunkChars: number;
  private tsLanguage: unknown;
  private tsxLanguage: unknown;

  constructor(config: { maxChunkSize?: number } = {}) {
    this.maxChunkChars = config.maxChunkSize || 3000;
    this.parser = new Parser();
    this.tsLanguage = TypeScript.typescript;
    this.tsxLanguage = TypeScript.tsx;
  }

  async chunk(filePath: string, content: string, language: string): Promise<CodeChunk[]> {
    const parserLang = this.getParserLanguage(language);

    if (parserLang) {
      try {
        return this.treeSitterChunk(filePath, content, language, parserLang);
      } catch {
        // Fall through to regex
      }
    }

    return this.regexChunk(filePath, content, language);
  }

  private getParserLanguage(language: string): unknown | null {
    switch (language) {
      case 'typescript':
        return this.tsLanguage;
      case 'tsx':
        return this.tsxLanguage;
      case 'javascript':
      case 'jsx':
        return this.tsLanguage; // tree-sitter-typescript handles JS too
      default:
        return null;
    }
  }

  private treeSitterChunk(
    filePath: string,
    content: string,
    language: string,
    parserLang: unknown
  ): CodeChunk[] {
    this.parser.setLanguage(parserLang as any);
    const tree = this.parser.parse(content);
    const blocks: ExtractedBlock[] = [];
    const nodeTypes = TS_QUERIES[language] || TS_QUERIES['typescript'] || [];

    this.extractBlocks(tree.rootNode, content, nodeTypes, blocks);

    if (blocks.length === 0) {
      return [this.createWholeFileChunk(filePath, content, language)];
    }

    const chunks: CodeChunk[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      if (block.content.length > this.maxChunkChars) {
        // Split oversized blocks
        const subChunks = this.splitBlock(filePath, block, language, i);
        chunks.push(...subChunks);
      } else {
        chunks.push({
          id: this.generateChunkId(filePath, i),
          filePath,
          content: block.content,
          startLine: block.startLine,
          endLine: block.endLine,
          language,
          astNode: block.chunkType || 'block',
          symbol: block.symbol,
          chunkType: block.chunkType,
        });
      }
    }

    return chunks;
  }

  private extractBlocks(
    node: Parser.SyntaxNode,
    content: string,
    nodeTypes: string[],
    blocks: ExtractedBlock[]
  ): void {
    for (const child of node.children) {
      if (nodeTypes.includes(child.type)) {
        const block = this.nodeToBlock(child, content);
        if (block) blocks.push(block);
      } else if (child.type === 'export_statement' && child.children.length > 0) {
        // Unwrap export statements to get the inner declaration
        for (const inner of child.children) {
          if (nodeTypes.includes(inner.type)) {
            const block = this.nodeToBlock(child, content); // use full export node
            if (block) blocks.push(block);
            break;
          }
        }
      }
    }
  }

  private nodeToBlock(node: Parser.SyntaxNode, _content: string): ExtractedBlock | null {
    const text = node.text;
    if (!text || text.trim().length === 0) return null;

    const symbol = this.extractSymbolName(node);
    const chunkType = this.classifyNodeType(node.type);

    return {
      content: text,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      symbol: symbol || 'anonymous',
      chunkType,
    };
  }

  private extractSymbolName(node: Parser.SyntaxNode): string | null {
    // Look for name/identifier child
    for (const child of node.children) {
      if (child.type === 'identifier' || child.type === 'type_identifier') {
        return child.text;
      }
      if (child.type === 'property_identifier') {
        return child.text;
      }
      // For variable declarations: const foo = ...
      if (child.type === 'variable_declarator' || child.type === 'lexical_declaration') {
        for (const inner of child.children) {
          if (inner.type === 'variable_declarator') {
            for (const nameNode of inner.children) {
              if (nameNode.type === 'identifier') return nameNode.text;
            }
          }
          if (inner.type === 'identifier') return inner.text;
        }
      }
      // For export statements, recurse into the declaration
      if (node.type === 'export_statement') {
        const found = this.extractSymbolName(child);
        if (found) return found;
      }
    }
    return null;
  }

  private classifyNodeType(nodeType: string): CodeChunk['chunkType'] {
    switch (nodeType) {
      case 'function_declaration':
        return 'function';
      case 'class_declaration':
        return 'class';
      case 'method_definition':
        return 'method';
      case 'interface_declaration':
        return 'interface';
      case 'type_alias_declaration':
        return 'type';
      case 'enum_declaration':
        return 'type';
      case 'export_statement':
        return 'module';
      case 'lexical_declaration':
        return 'module';
      default:
        return 'block';
    }
  }

  private splitBlock(
    filePath: string,
    block: ExtractedBlock,
    language: string,
    blockIndex: number
  ): CodeChunk[] {
    const lines = block.content.split('\n');
    const maxLines = Math.floor(this.maxChunkChars / 80); // approx chars per line
    const chunks: CodeChunk[] = [];

    for (let i = 0; i < lines.length; i += maxLines) {
      const endIdx = Math.min(i + maxLines, lines.length);
      const subContent = lines.slice(i, endIdx).join('\n');

      chunks.push({
        id: this.generateChunkId(filePath, blockIndex * 100 + chunks.length),
        filePath,
        content: subContent,
        startLine: block.startLine + i,
        endLine: block.startLine + endIdx - 1,
        language,
        astNode: block.chunkType || 'block',
        symbol: block.symbol + (chunks.length > 0 ? `_part${chunks.length}` : ''),
        chunkType: block.chunkType,
      });
    }

    return chunks;
  }

  /**
   * Regex-based fallback for languages without tree-sitter grammar
   */
  private regexChunk(filePath: string, content: string, language: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');

    const patterns: Array<{ pattern: RegExp; type: CodeChunk['chunkType'] }> = [
      { pattern: /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)/, type: 'function' },
      { pattern: /^(\s*)(export\s+)?const\s+(\w+)\s*=\s*(\([^)]*\)|[^\s]+)\s*=>/, type: 'function' },
      { pattern: /^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)/, type: 'class' },
      { pattern: /^(\s*)(export\s+)?interface\s+(\w+)/, type: 'interface' },
      { pattern: /^(\s*)(export\s+)?type\s+(\w+)/, type: 'type' },
      // Python patterns
      { pattern: /^(\s*)def\s+(\w+)\s*\(/, type: 'function' },
      { pattern: /^(\s*)class\s+(\w+)/, type: 'class' },
      // Go patterns
      { pattern: /^func\s+(\w+)/, type: 'function' },
      { pattern: /^func\s+\(\w+\s+\*?\w+\)\s+(\w+)/, type: 'method' },
      { pattern: /^type\s+(\w+)\s+struct/, type: 'class' },
      { pattern: /^type\s+(\w+)\s+interface/, type: 'interface' },
    ];

    let currentBlock: { startLine: number; lines: string[]; symbol: string; type: CodeChunk['chunkType'] } | null = null;
    let braceDepth = 0;
    let chunkIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let matched = false;

      if (currentBlock === null) {
        for (const { pattern, type } of patterns) {
          const match = line.match(pattern);
          if (match) {
            const symbolName = match[match.length - 1] || match[match.length - 2] || 'anonymous';
            currentBlock = { startLine: i + 1, lines: [line], symbol: symbolName, type };
            braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
            matched = true;
            break;
          }
        }
      }

      if (!matched && currentBlock) {
        currentBlock.lines.push(line);
        braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

        if (braceDepth <= 0 && (line.includes('}') || line.match(/;\s*$/))) {
          const blockContent = currentBlock.lines.join('\n');
          chunks.push({
            id: this.generateChunkId(filePath, chunkIndex),
            filePath,
            content: blockContent,
            startLine: currentBlock.startLine,
            endLine: i + 1,
            language,
            astNode: currentBlock.type || 'block',
            symbol: currentBlock.symbol,
            chunkType: currentBlock.type,
          });
          currentBlock = null;
          chunkIndex++;
        }
      }
    }

    // Flush remaining block
    if (currentBlock) {
      const blockContent = currentBlock.lines.join('\n');
      chunks.push({
        id: this.generateChunkId(filePath, chunkIndex),
        filePath,
        content: blockContent,
        startLine: currentBlock.startLine,
        endLine: currentBlock.startLine + currentBlock.lines.length - 1,
        language,
        astNode: currentBlock.type || 'block',
        symbol: currentBlock.symbol,
        chunkType: currentBlock.type,
      });
    }

    if (chunks.length === 0) {
      return [this.createWholeFileChunk(filePath, content, language)];
    }

    return chunks;
  }

  private createWholeFileChunk(filePath: string, content: string, language: string): CodeChunk {
    return {
      id: this.generateChunkId(filePath, 0),
      filePath,
      content,
      startLine: 1,
      endLine: content.split('\n').length,
      language,
      astNode: 'module',
      chunkType: 'module',
    };
  }

  private generateChunkId(filePath: string, index: number): string {
    const hash = createHash('sha256')
      .update(`${filePath}:${index}`)
      .digest('hex')
      .substring(0, 8);
    return `ts-${index}-${hash}`;
  }
}
