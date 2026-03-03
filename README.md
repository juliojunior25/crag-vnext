# CRAG - Code RAG

Busca semântica de código com indexação híbrida (lexical + vetorial) usando PostgreSQL/pgvector, Ollama e Tree-sitter.

## Stack

- **PostgreSQL + pgvector** - armazenamento vetorial e busca full-text
- **Ollama** - embeddings locais (qwen3-embedding:0.6b)
- **Tree-sitter** - chunking syntax-aware por AST
- **Fastify** - API REST
- **Commander** - CLI

## Pré-requisitos

- Node.js >= 18.18
- Docker (para PostgreSQL com pgvector)
- [Ollama](https://ollama.com) rodando localmente

```bash
# Baixar o modelo de embedding
ollama pull qwen3-embedding:0.6b
```

## Setup

```bash
# 1. Subir PostgreSQL com pgvector
make up

# 2. Copiar e ajustar variáveis de ambiente
cp .env.example .env

# 3. Instalar dependências
npm install

# 4. Indexar os repositórios
make index
```

## CLI

```bash
# Indexar todos os repos (incremental)
npx tsx src/cli/index.ts index

# Indexar todos os repos (full reindex)
npx tsx src/cli/index.ts index --full

# Indexar um repo específico
npx tsx src/cli/index.ts index --repo my-project

# Buscar no código
npx tsx src/cli/index.ts query "como funciona autenticação"

# Buscar com context pack (saída formatada para LLM)
npx tsx src/cli/index.ts query "auth middleware" --pack

# Monitorar mudanças (reindexação automática a cada 30s)
npx tsx src/cli/index.ts watch

# Ver status de indexação por repo
npx tsx src/cli/index.ts status

# Verificar saúde (DB + Ollama)
npx tsx src/cli/index.ts health
```

### Atalhos via Makefile

```bash
make index                          # full reindex
make query Q='como funciona o login' # busca rápida
make status                          # status dos repos
make health                          # health check
```

## API REST

```bash
# Iniciar servidor (porta 8080)
npx tsx src/api/server.ts
```

### Endpoints

**POST /query** - Busca semântica
```json
{
  "q": "como funciona o checkout",
  "repos": ["my-frontend", "my-backend"],
  "finalK": 10,
  "pack": false
}
```

**POST /index** - Disparar indexação
```json
{ "repo": "my-project", "full": true }
```

**GET /status** - Status de indexação por repo

**GET /health** - Health check (Postgres + Ollama)

## Configuração

Toda a configuração fica em `config/rag.yaml`:

```yaml
repos:
  - name: my-project
    path: /absolute/path/to/repo
    extensions: [".ts", ".tsx", ".js", ".jsx"]
    excludeDirs: [node_modules, dist, build, .git, __tests__, docs]
    excludePatterns: ["*.test.*", "*.spec.*", "*.stories.*"]
    buildDependencyGraph: true

query:
  lexicalK: 30        # candidatos da busca lexical
  vectorK: 30         # candidatos da busca vetorial
  finalK: 10          # resultados finais após merge
  lexicalWeight: 0.55 # peso lexical (vetor = 1 - lexicalWeight)
  maxRepos: 8         # máximo de repos por query

embeddingModel: "qwen3-embedding:0.6b"
embeddingDimensions: 1024
maxChunkSize: 3000
watchInterval: 30
```

### Variáveis de ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `DATABASE_URL` | `postgresql://crag:crag@localhost:5433/crag` | Conexão PostgreSQL |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | URL do Ollama |
| `RAG_CONFIG` | `config/rag.yaml` | Caminho do config |
| `EMBEDDING_MODEL` | `qwen3-embedding:0.6b` | Modelo de embedding |
| `EMBEDDING_DIMENSIONS` | `1024` | Dimensões do embedding |
| `API_PORT` | `8080` | Porta da API REST |
| `LOG_LEVEL` | `info` | Nível de log |

## Docker

```bash
# Subir tudo (DB + API + Worker)
docker compose up -d

# Somente o banco
docker compose up -d db

# Derrubar tudo + limpar volumes
make clean
```

O `docker-compose.yml` sobe 3 serviços:
- **db** - PostgreSQL 16 com pgvector (porta 5433)
- **api** - Servidor REST Fastify (porta 8080)
- **worker** - Indexador contínuo (watch mode)

## Como funciona

1. **Coleta** - FileCollector varre os repos respeitando filtros de extensão/diretório/pattern
2. **Chunking** - Tree-sitter parseia o código em AST e extrai chunks semânticos (funções, classes, interfaces)
3. **Embedding** - Ollama gera vetores de 1024 dimensões para cada chunk
4. **Armazenamento** - Chunks são armazenados no PostgreSQL com embedding (pgvector) e tsvector (full-text)
5. **Indexação incremental** - Usa `git diff` para detectar arquivos alterados e reindexar apenas o necessário
6. **Busca híbrida** - Combina similaridade vetorial (coseno) com busca full-text (ts_rank), ponderadas por `lexicalWeight`

## Licença

MIT
