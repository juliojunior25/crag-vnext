# CRAG Config Generator

Skill especializada em gerar o arquivo `config/rag.yaml` para o CRAG de forma interativa.

## Trigger

Use quando o usuário pedir para configurar o CRAG, gerar o yaml, adicionar repos, ou setup inicial.

## Fluxo

### Passo 1 — Descobrir os projetos

Pergunte ao usuário quais repositórios ele quer indexar. Se ele não souber, liste os diretórios em `~/developer/` ou no path que ele indicar usando `ls`.

Use AskUserQuestion para confirmar os repos selecionados.

### Passo 2 — Detectar stack de cada repo

Para cada repo selecionado, inspecione automaticamente:
1. Rode `ls {repo_path}` para ver a estrutura
2. Verifique se existe `package.json` (Node/JS/TS), `pyproject.toml`/`setup.py` (Python), `go.mod` (Go), `Cargo.toml` (Rust), `pom.xml`/`build.gradle` (Java)
3. Detecte o framework: React Native (`react-native` em package.json), Next.js (`next`), Express, NestJS, Strapi, Django, etc.
4. Identifique diretórios que devem ser excluídos (node_modules, dist, build, .git, coverage, __tests__, docs, etc.)

Com base na detecção, defina automaticamente:
- `extensions`: extensões relevantes para a stack
- `excludeDirs`: diretórios irrelevantes para RAG
- `excludePatterns`: padrões de arquivos de teste/mock/stories
- `buildDependencyGraph`: `true` para JS/TS, `false` para outras stacks

### Passo 3 — Perguntar preferências gerais

Use AskUserQuestion para perguntar:

**Modelo de embedding:**
- `qwen3-embedding:0.6b` — Rápido, 1024 dims, ~640MB RAM (Recomendado para Mac com ≤16GB)
- `qwen3-embedding:4b` — Melhor qualidade, 2560 dims, ~3GB RAM (Recomendado para Mac com ≥32GB). ATENÇÃO: pgvector HNSW suporta no máximo 2000 dims, será necessário truncar.
- `bge-m3` — Bom para multilingual + código, 1024 dims

**Tipo de busca:**
- `fts` — Full-text search com ts_rank_cd (funciona em qualquer Postgres) (Recomendado)
- `bm25` — Requer extensão pg_textsearch, melhor ranking

**Query tuning (usar defaults ou personalizar?):**
- Defaults: lexicalK=30, vectorK=30, finalK=10, lexicalWeight=0.55
- Personalizar: perguntar cada valor

### Passo 4 — Gerar o YAML

Monte o `config/rag.yaml` completo seguindo a estrutura do `config/rag.example.yaml` como referência.

Regras de geração:
- O campo `embeddingDimensions` DEVE corresponder ao modelo escolhido:
  - `qwen3-embedding:0.6b` → 1024
  - `qwen3-embedding:4b` → 2560 (ou 2000 se truncar)
  - `bge-m3` → 1024
- `maxRepos` deve ser ≥ número de repos configurados
- `reranker.enabled` sempre `false` (Ollama não suporta reranking nativamente ainda)
- Inclua comentários úteis no YAML gerado

### Passo 5 — Confirmar e salvar

Mostre o YAML gerado ao usuário e pergunte se quer ajustar algo antes de salvar.

Salve em `config/rag.yaml` usando o Write tool.

Se já existir um `config/rag.yaml`, avise o usuário que vai sobrescrever.

## Mapeamento de Stacks

| Indicador | Stack | Extensions | ExcludeDirs extras |
|-----------|-------|------------|-------------------|
| `react-native` em package.json | React Native | .ts, .tsx, .js, .jsx | android, ios, __tests__, e2e |
| `next` em package.json | Next.js | .ts, .tsx, .js, .jsx | .next, out |
| `express` em package.json | Express | .ts, .js | |
| `@nestjs/core` em package.json | NestJS | .ts | |
| `strapi` em package.json | Strapi | .ts, .js | public |
| `pyproject.toml` ou `setup.py` | Python | .py | __pycache__, .venv, venv, .mypy_cache |
| `go.mod` | Go | .go | vendor |
| `Cargo.toml` | Rust | .rs | target |
| `pom.xml` ou `build.gradle` | Java/Kotlin | .java, .kt | target, .gradle |

## Ignore patterns padrão

Sempre incluir nos `excludePatterns` de cada repo:
- `"*.test.*"`, `"*.spec.*"` — testes
- `"*.stories.*"` — Storybook (se JS/TS)
- `"*.mock.*"` — mocks

Sempre incluir no `ignore.patterns` global:
- `"*.test.*"`, `"*.spec.*"`, `"*.stories.*"`, `"*.mock.*"`
- `"CHANGELOG*"`, `"package-lock.json"`, `"*.min.js"`, `"*.min.css"`, `"*.snap"`, `"*.generated.*"`
