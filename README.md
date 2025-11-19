# @cragjs/indexing

Módulo de indexação e busca semântica para CRAGCore.

## Recursos

- 🔍 **Busca Semântica**: Busque código por significado, não por texto exato
- 🤖 **Embeddings Locais**: Suporte nativo para Ollama (local) e OpenAI
- 📦 **Bancos Vetoriais**: Memória, JSON, Pinecone e Chroma
- 🎯 **Múltiplas Estratégias**: Chunking por AST, sliding window ou fixed-size
- 🔗 **Grafo de Dependências**: Análise automática de dependências entre arquivos
- ⚡ **Alto Desempenho**: Batch processing e cache inteligente

## Instalação

```bash
npm install @cragjs/indexing
```

## Uso Básico

### API Simplificada (Recomendado)

A forma mais simples de usar o CRAGCore é através da classe `CRAGCore`, que aceita todas as configurações em um único objeto:

```typescript
import { CRAGCore } from '@cragjs/indexing';

// Criar instância com todas as configurações
const rag = new CRAGCore({
  projectPath: '/path/to/your/project',
  projectId: 'my-project',
  
  // Configuração do provider de embeddings
  embedding: {
    type: 'ollama',
    model: 'embeddinggemma',
    baseURL: 'http://localhost:11434',
    timeout: 60000,
  },
  
  // Configuração do banco vetorial
  vectorDatabase: {
    type: 'json',
    storagePath: '.crag_cache',
    persist: true,
  },
  
  // Configurações opcionais de indexação
  indexing: {
    excludeDirectories: ['node_modules', '.git', 'dist'],
    buildDependencyGraph: true,
    chunkingStrategy: 'ast',
  },
  
  // Configurações de armazenamento
  storage: {
    path: '.crag_cache',
    persist: true,
  },
});

// Indexar o repositório
const repository = await rag.index();

// Buscar no código
const results = await rag.query({
  text: 'como fazer autenticação de usuário?',
  topK: 5,
  minSimilarity: 0.3,
});

// Exibir resultados
results.forEach(result => {
  console.log(`${result.filePath}:${result.metadata.startLine}`);
  console.log(`Similaridade: ${(result.similarity * 100).toFixed(1)}%`);
  console.log(result.content);
});
```

### API Avançada

Para mais controle, você pode usar as classes individuais:

```typescript
import { RepositoryIndexer, OllamaEmbeddingProvider, MemoryVectorDatabase } from '@cragjs/indexing';

// Configurar embedding provider (Ollama local)
const embeddingProvider = new OllamaEmbeddingProvider({
  baseURL: 'http://localhost:11434',
  model: 'embeddinggemma',
  timeout: 60000,
});

// Configurar banco vetorial
const vectorDatabase = new MemoryVectorDatabase();

// Criar indexador
const indexer = new RepositoryIndexer({
  projectPath: '/path/to/your/project',
  projectId: 'my-project',
  embeddingProvider,
  vectorDatabase,
  storagePath: '.crag_cache',
});

// Indexar o repositório
const repository = await indexer.index({
  buildDependencyGraph: true,
  persist: true,
  excludeDirectories: ['node_modules', '.git', 'dist'],
});

// Buscar no código
const results = await indexer.query({
  text: 'como fazer autenticação de usuário?',
  topK: 5,
  minSimilarity: 0.3
});
```

## Configuração de Providers

### Providers de Embedding

Com a API simplificada, você configura o embedding diretamente no objeto de configuração:

```typescript
// Ollama (Local, Recomendado)
const rag = new CRAGCore({
  // ...
  embedding: {
    type: 'ollama',
    model: 'embeddinggemma',
    baseURL: 'http://localhost:11434',
    timeout: 60000,
  },
  // ...
});

// Llama.cpp (Mais rápido, sem servidor externo)
// Requer download de modelo GGUF (ex: nomic-embed-text)
const rag = new CRAGCore({
  // ...
  embedding: {
    type: 'llama-cpp',
    modelPath: './models/nomic-embed-text-v1.5.Q4_K_M.gguf', // Caminho para o modelo GGUF
    dimensions: 768, // Opcional, será auto-detectado
  },
  // ...
});

// ⚠️ Ollama Cloud - NÃO RECOMENDADO (não suporta embeddings)
// O Ollama Cloud atualmente NÃO suporta o endpoint /api/embeddings.
// Use Ollama local ou outro provider.
//
// const rag = new CRAGCore({
//   // ...
//   embedding: {
//     type: 'ollama-cloud', // ❌ Não funciona - endpoint não existe
//     model: 'nomic-embed-text',
//     apiKey: process.env.OLLAMA_API_KEY,
//   },
//   // ...
// });

// OpenAI
const rag = new CRAGCore({
  // ...
  embedding: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'text-embedding-ada-002',
  },
  // ...
});

// OpenRouter
const rag = new CRAGCore({
  // ...
  embedding: {
    type: 'openrouter',
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: 'text-embedding-3-small',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  // ...
});
```

### Setup Automatizado do Ollama Cloud

O pacote oferece funções para configurar automaticamente a API key do Ollama Cloud:

```typescript
import { 
  setupOllamaCloudInteractive, 
  setupOllamaCloudAuto,
  validateOllamaCloudApiKey 
} from '@cragjs/indexing';

// Setup interativo (pergunta pela API key e salva no .env)
await setupOllamaCloudInteractive();

// Setup automático (tenta carregar do .env ou variável de ambiente)
const apiKey = await setupOllamaCloudAuto();
if (!apiKey) {
  // Se não encontrou, fazer setup interativo
  await setupOllamaCloudInteractive();
}

// Validar se a API key está funcionando
const isValid = await validateOllamaCloudApiKey();
if (!isValid) {
  console.error('API key inválida ou não configurada');
}
```

**Obter API Key:**
1. Acesse https://ollama.com/settings/keys
2. Crie uma nova API key
3. Use `setupOllamaCloudInteractive()` ou defina `OLLAMA_API_KEY` no `.env`

### Llama.cpp - Modelos Recomendados

O modelo de embedding é **baixado automaticamente** quando você executa `npm install`!

**Modelo padrão:**
- `nomic-embed-text-v1.5` (768 dimensões) - Baixado automaticamente para `./models/`

**Download manual (se necessário):**
```bash
# O modelo é baixado automaticamente no npm install
# Mas você pode baixar manualmente se precisar:
npm run download-model

# Ou usando huggingface-cli:
huggingface-cli download nomic-ai/nomic-embed-text-v1.5 \
  --local-dir models \
  --include "*.gguf"
```

**Outros modelos recomendados:**
- `mxbai-embed-large-v1` (1024 dimensões) - [Download](https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1)
- `all-minilm-l6-v2` (384 dimensões) - [Download](https://huggingface.co/ggml/all-minilm-l6-v2-gguf)

### Uso Avançado com Classes Individuais

```typescript
import { 
  OllamaEmbeddingProvider, 
  OllamaCloudEmbeddingProvider,
  LlamaCppEmbeddingProvider,
  OpenAIEmbeddingProvider 
} from '@cragjs/indexing';

// Ollama Local
const ollamaProvider = new OllamaEmbeddingProvider({
  baseURL: 'http://localhost:11434',
  model: 'embeddinggemma',
  timeout: 60000,
});

// Llama.cpp (Mais rápido)
const llamaProvider = new LlamaCppEmbeddingProvider({
  modelPath: './models/nomic-embed-text-v1.5.Q4_K_M.gguf',
  dimensions: 768,
});

// Ollama Cloud
const ollamaCloudProvider = new OllamaCloudEmbeddingProvider({
  model: 'nomic-embed-text',
  apiKey: process.env.OLLAMA_API_KEY!,
});

// OpenAI
const openaiProvider = new OpenAIEmbeddingProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'text-embedding-ada-002',
});
```

## Configuração de Bancos Vetoriais

Com a API simplificada, você configura o banco vetorial diretamente no objeto de configuração:

```typescript
// Memória (Rápido, para desenvolvimento)
const rag = new CRAGCore({
  // ...
  vectorDatabase: {
    type: 'memory',
  },
  // ...
});

// JSON (Persistente, simples)
const rag = new CRAGCore({
  // ...
  vectorDatabase: {
    type: 'json',
    storagePath: '.crag_cache',
    persist: true,
  },
  // ...
});

// Pinecone (Produção, escalável)
const rag = new CRAGCore({
  // ...
  vectorDatabase: {
    type: 'pinecone',
    apiKey: process.env.PINECONE_API_KEY!,
    collectionName: 'code-index',
  },
  // ...
});

// Chroma (Self-hosted)
const rag = new CRAGCore({
  // ...
  vectorDatabase: {
    type: 'chroma',
    host: 'http://localhost',
    port: 8000,
  },
  // ...
});
```

### Uso Avançado com Classes Individuais

```typescript
import { MemoryVectorDatabase, JSONVectorDatabase, PineconeVectorDatabase } from '@cragjs/indexing';

// Memória
const memoryDb = new MemoryVectorDatabase();

// JSON
const jsonDb = new JSONVectorDatabase({ storagePath: '.crag_cache' });

// Pinecone
const pineconeDb = new PineconeVectorDatabase({
  apiKey: process.env.PINECONE_API_KEY!,
  indexName: 'code-index',
});
```

## Configuração de Estratégias de Chunking

Com a API simplificada, você configura a estratégia de chunking no objeto de configuração:

```typescript
const rag = new CRAGCore({
  // ...
  indexing: {
    chunkingStrategy: 'ast', // 'ast', 'sliding-window', ou 'semantic'
    maxChunkSize: 100,       // Tamanho máximo do chunk em tokens
    chunkOverlap: 10,        // Sobreposição entre chunks
  },
  // ...
});
```

### Uso Avançado com Classes Individuais

```typescript
import { ASTChunkingStrategy, SlidingWindowChunkingStrategy, FixedSizeChunkingStrategy } from '@cragjs/indexing';

// Por AST (recomendado para código)
const astChunking = new ASTChunkingStrategy();

// Janela deslizante
const slidingChunking = new SlidingWindowChunkingStrategy({
  chunkSize: 512,
  overlap: 50,
});

// Tamanho fixo
const fixedChunking = new FixedSizeChunkingStrategy({
  chunkSize: 1000,
});
```

## Licença

MIT

