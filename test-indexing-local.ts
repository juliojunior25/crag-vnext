import { CRAGCore } from './src/core/index';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * Script de Indexação Interativa usando CRAGCore
 * 
 * 1. Lista projetos na mesma pasta pai.
 * 2. Permite selecionar um projeto.
 * 3. Indexa usando Llama.cpp + Memória (API simplificada).
 * 
 * Requer: Modelo GGUF em ./models/nomic-embed-text-v1.5.Q4_K_M.gguf
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log('🚀 Explorador de Projetos CodeRAG (Llama.cpp + Memória)\n');

  // 1. Listar projetos irmãos
  const currentDir = process.cwd();
  const parentDir = path.resolve(currentDir, '..');
  
  console.log(`📂 Buscando projetos em: ${parentDir}`);

  let projects: string[] = [];
  try {
    const items = fs.readdirSync(parentDir);
    projects = items.filter(item => {
      const fullPath = path.join(parentDir, item);
      return fs.statSync(fullPath).isDirectory() && !item.startsWith('.');
    });
  } catch (e) {
    console.error('❌ Erro ao ler diretório pai:', e);
    process.exit(1);
  }

  if (projects.length === 0) {
    console.error('❌ Nenhum projeto encontrado no diretório pai.');
    process.exit(1);
  }

  console.log('\nProjetos encontrados:');
  projects.forEach((proj, index) => {
    console.log(`${index + 1}. ${proj}`);
  });

  // 2. Selecionar Projeto
  let selectedProject = '';
  while (!selectedProject) {
    const answer = await prompt('\n👉 Escolha o número do projeto para indexar: ');
    const num = parseInt(answer);
    if (!isNaN(num) && num > 0 && num <= projects.length) {
      selectedProject = projects[num - 1];
    } else {
      console.log('❌ Opção inválida.');
    }
  }

  const projectPath = path.join(parentDir, selectedProject);
  console.log(`\n✅ Selecionado: ${selectedProject} (${projectPath})\n`);

  // 3. Configurar CodeRAG com API simplificada
  console.log('📡 Inicializando CodeRAG...');
  
  // Verificar se o modelo existe (será baixado automaticamente no npm install)
  const modelPath = './models/nomic-embed-code.Q4_K_M.gguf';
  const modelDimensions = 4096; // nomic-embed-code tem 4096 dimensões

  if (!fs.existsSync(modelPath)) {
    console.error('\n❌ Modelo não encontrado!');
    console.error(`   Caminho esperado: ${modelPath}`);
    console.error('\n💡 O modelo é baixado automaticamente no npm install.');
    console.error('   Se não foi baixado, execute:');
    console.error('   npm run download-model');
    console.error('\n   Ou baixe manualmente:');
    console.error('   huggingface-cli download nomic-ai/nomic-embed-code-GGUF \\');
    console.error('     --local-dir models \\');
    console.error('     --include "nomic-embed-code.Q4_K_M.gguf"');
    process.exit(1);
  }

  console.log(`✅ Modelo encontrado: nomic-embed-code (${modelDimensions} dimensões)`);

  const rag = new CRAGCore({
    projectPath: projectPath,
    projectId: `temp-${selectedProject}`,
    embedding: {
      type: 'llama-cpp', // Llama.cpp (mais rápido, sem servidor externo)
      modelPath: modelPath,
      dimensions: modelDimensions, // nomic-embed-code tem 4096 dimensões
    },
    vectorDatabase: {
      type: 'json',  // 💾 Persiste os vetores em disco!
      storagePath: '.analyzer_cache',
      persist: true,
    },
    indexing: {
      buildDependencyGraph: true,
      excludeDirectories: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'],
    },
    storage: {
      path: '.analyzer_cache',
      persist: true,
    },
  });

  console.log('📦 Iniciando indexação...');
  console.log('   (Pode demorar dependendo do tamanho do projeto)\n');

  const repo = await rag.index();

  console.log(`\n✅ Indexação concluída!`);
  console.log(`  - Arquivos: ${repo.totalFiles}`);
  console.log(`  - Vetores: ${repo.totalVectors}`);
  console.log(`  - Tempo: ${(repo.stats.duration / 1000).toFixed(2)}s\n`);

  // 5. Loop de Consultas
  console.log('💬 Modo de Chat (Digite "sair" para encerrar)');
  
  while (true) {
    const queryText = await prompt('\n❓ Pergunta: ');
    if (queryText.toLowerCase() === 'sair' || queryText.toLowerCase() === 'exit') {
      break;
    }
    if (!queryText) continue;

    console.log('   Buscando...');
    const results = await rag.query({
      text: queryText,
      topK: 3,
      minSimilarity: 0.3
    });

    if (results.length === 0) {
      console.log('   (Nenhum resultado relevante)');
    } else {
      results.forEach((r, i) => {
        const fileName = path.basename(r.filePath);
        console.log(`   ${i+1}. [${(r.similarity * 100).toFixed(1)}%] ${fileName}:${r.metadata.startLine}`);
        console.log(`      Trecho: "${r.content.substring(0, 100).replace(/\n/g, ' ')}..."`);
      });
    }
  }

  rl.close();
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  rl.close();
  process.exit(1);
});
