import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { downloadFileToCacheDir } from '@huggingface/hub';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Script para baixar o modelo de embedding automaticamente
 * Executado no postinstall do npm
 */

// Modelo de embedding GGUF para código
// nomic-embed-code é otimizado para código e suporta múltiplas linguagens
const MODEL_CONFIG = {
  repo: 'nomic-ai/nomic-embed-code-GGUF',
  file: 'nomic-embed-code.Q4_K_M.gguf', // Versão recomendada: boa qualidade e tamanho razoável (~4GB)
  note: 'nomic-embed-code GGUF - Modelo otimizado para código (7B parâmetros)',
  dimensions: 4096, // Dimensões do embedding (baseado na arquitetura Qwen2.5-7B)
  originalRepo: 'nomic-ai/nomic-embed-code'
};

const MODELS_DIR = path.join(process.cwd(), 'models');

/**
 * Abre a URL no navegador padrão
 */
async function openBrowser(url: string): Promise<void> {
  try {
    const platform = process.platform;
    let command: string;

    if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else if (platform === 'darwin') {
      command = `open "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    await execAsync(command);
  } catch (error) {
    // Ignorar erros ao abrir navegador
  }
}

/**
 * Valida o formato do token do HuggingFace
 */
function isValidToken(token: string): boolean {
  return token.startsWith('hf_') && token.length > 10;
}

/**
 * Obtém o token do HuggingFace de variável de ambiente ou solicita interativamente
 */
async function getHuggingFaceToken(): Promise<string> {
  // Primeiro, tentar da variável de ambiente
  const tokenFromEnv = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || process.env.HF_ACCESS_TOKEN;
  if (tokenFromEnv && isValidToken(tokenFromEnv)) {
    console.log('✅ Token do HuggingFace encontrado na variável de ambiente\n');
    return tokenFromEnv;
  }

  // Se não estiver em modo interativo (npm install automático), mostrar instruções e sair
  // Mas permitir interação quando executado manualmente via npm run download-model
  const isAutoInstall = process.env.npm_lifecycle_event === 'postinstall' && !process.stdin.isTTY;
  
  if (isAutoInstall) {
    console.log('\n❌ Token do HuggingFace necessário para download');
    console.log('\n📋 Para configurar o token:');
    console.log('   1. Obtenha um token em: https://huggingface.co/settings/tokens');
    console.log('   2. Configure a variável de ambiente:');
    console.log('      Windows: set HF_TOKEN=hf_...');
    console.log('      Linux/Mac: export HF_TOKEN=hf_...');
    console.log('   3. Execute manualmente: npm run download-model\n');
    process.exit(1);
  }

  // Modo interativo: guiar o usuário através do processo
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\n' + '='.repeat(60));
    console.log('🔑 Autenticação do HuggingFace Necessária');
    console.log('='.repeat(60));
    console.log('\n📝 Para baixar o modelo, você precisa de um token do HuggingFace.');
    console.log('   O token é gratuito e pode ser obtido em segundos.\n');
    
    console.log('🌐 Abrindo a página de tokens no seu navegador...\n');
    
    // Abrir navegador (não esperar, continuar imediatamente)
    openBrowser('https://huggingface.co/settings/tokens').catch(() => {
      // Ignorar erros ao abrir navegador
    });
    
    // Dar um pequeno delay para o navegador abrir, mas não bloquear
    setTimeout(() => {
      console.log('✅ Navegador aberto!');
      console.log('   Se não abriu automaticamente, acesse: https://huggingface.co/settings/tokens\n');
      
      console.log('📋 Instruções:');
      console.log('   1. Faça login na sua conta HuggingFace (ou crie uma gratuita)');
      console.log('   2. Clique em "New token"');
      console.log('   3. Dê um nome ao token (ex: "cragjs-indexing")');
      console.log('   4. Selecione "Read" como permissão');
      console.log('   5. Clique em "Generate token"');
      console.log('   6. Copie o token (começa com "hf_...")\n');
      
      const askToken = () => {
        rl.question('🔑 Cole seu token do HuggingFace aqui (ou pressione Ctrl+C para cancelar): ', async (answer) => {
          const token = answer.trim();
          
          if (!token) {
            console.log('\n⚠️  Token não pode estar vazio. Tente novamente.\n');
            askToken();
            return;
          }
          
          if (!isValidToken(token)) {
            console.log('\n❌ Token inválido. O token deve começar com "hf_" e ter pelo menos 10 caracteres.');
            console.log('   Exemplo: hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n');
            askToken();
            return;
          }
          
          console.log('\n✅ Token recebido! Validando...');
          
          // Tentar validar o token fazendo uma requisição simples
          try {
            // Testar o token tentando baixar um arquivo pequeno do repositório do modelo
            await downloadFileToCacheDir({
              repo: MODEL_CONFIG.repo,
              path: 'README.md',
              accessToken: token
            });
            console.log('✅ Token válido!\n');
            rl.close();
            resolve(token);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('Invalid')) {
              console.log('\n❌ Token inválido ou expirado. Verifique se:');
              console.log('   - O token está correto (começa com "hf_")');
              console.log('   - O token não expirou');
              console.log('   - Você copiou o token completo\n');
              askToken();
            } else {
              // Se não for erro de autenticação, aceitar o token mesmo assim
              // Pode ser um erro de rede ou outro problema
              console.log('✅ Token aceito (validação parcial)\n');
              rl.close();
              resolve(token);
            }
          }
        });
      };
      
      askToken();
    }, 500); // Pequeno delay para o navegador abrir
  });
}

/**
 * Tenta baixar o modelo
 */
async function tryDownloadModel(
  model: typeof MODEL_CONFIG,
  accessToken: string,
  targetPath: string
): Promise<boolean> {
  try {
    const downloadOptions: {
      repo: string;
      path: string;
      accessToken: string;
    } = {
      repo: model.repo,
      path: model.file,
      accessToken: accessToken,
    };

    const downloadedPath = await downloadFileToCacheDir(downloadOptions);

    // Copiar do cache para o destino final
    if (downloadedPath !== targetPath) {
      fs.copyFileSync(downloadedPath, targetPath);
    }

    return true;
  } catch (error) {
    return false;
  }
}

async function downloadModel() {
  const modelPath = path.join(MODELS_DIR, MODEL_CONFIG.file);
  
  // Verificar se o modelo já existe
  if (fs.existsSync(modelPath)) {
    const stats = fs.statSync(modelPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`✅ Modelo já existe: ${modelPath} (${sizeMB} MB)`);
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log('📥 Download do Modelo de Embedding');
  console.log('='.repeat(60));
  console.log(`\n📦 Modelo: ${MODEL_CONFIG.repo}`);
  console.log(`📄 Arquivo: ${MODEL_CONFIG.file}`);
  console.log(`📁 Destino: ${modelPath}`);
  console.log(`ℹ️  ${MODEL_CONFIG.note}`);
  console.log(`🔢 Dimensões: ${MODEL_CONFIG.dimensions}`);
  console.log(`📊 Tamanho aproximado: ~4GB (Q4_K_M quantizado)\n`);

  try {
    // Criar diretório se não existir
    if (!fs.existsSync(MODELS_DIR)) {
      fs.mkdirSync(MODELS_DIR, { recursive: true });
      console.log(`📁 Diretório criado: ${MODELS_DIR}\n`);
    }

    // Obter token de autenticação (obrigatório)
    let accessToken = await getHuggingFaceToken();

    // Baixar o modelo
    console.log('⏳ Iniciando download (isso pode demorar vários minutos, ~4GB)...');
    console.log('   Usando @huggingface/hub para download seguro...\n');
    
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        const success = await tryDownloadModel(MODEL_CONFIG, accessToken, modelPath);
        
        if (success) {
          // Sucesso!
          console.log('\n' + '='.repeat(60));
          console.log('✅ Modelo baixado com sucesso!');
          console.log('='.repeat(60));
          const stats = fs.statSync(modelPath);
          console.log(`\n📦 Modelo: ${MODEL_CONFIG.repo}/${MODEL_CONFIG.file}`);
          console.log(`📊 Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          console.log(`📁 Local: ${modelPath}`);
          console.log(`🔢 Dimensões: ${MODEL_CONFIG.dimensions}\n`);
          return;
        } else {
          throw new Error('Download falhou sem detalhes específicos');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Se for erro de autenticação, pedir token novamente
        if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('Invalid')) {
          console.log('\n❌ Erro de autenticação detectado.');
          console.log('   O token pode estar inválido ou expirado.\n');
          
          if (retries < maxRetries - 1) {
            console.log('🔄 Tentando novamente com novo token...\n');
            accessToken = await getHuggingFaceToken();
            retries++;
            continue;
          } else {
            throw new Error('Token inválido após múltiplas tentativas. Verifique seu token em https://huggingface.co/settings/tokens');
          }
        }
        
        // Outros erros
        throw new Error(
          `Erro ao baixar modelo: ${errorMessage}\n` +
          `Acesse https://huggingface.co/${MODEL_CONFIG.repo} para ver os arquivos disponíveis`
        );
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n' + '='.repeat(60));
    console.error('❌ Erro ao baixar modelo');
    console.error('='.repeat(60));
    console.error(`\n${errorMessage}\n`);
    console.error('💡 Alternativas:');
    console.error(`   1. Acesse: https://huggingface.co/${MODEL_CONFIG.repo}`);
    console.error(`   2. Baixe o arquivo ${MODEL_CONFIG.file} manualmente`);
    console.error(`   3. Coloque em: ${modelPath}`);
    console.error(`   4. Ou use: huggingface-cli download ${MODEL_CONFIG.repo} --include "${MODEL_CONFIG.file}" --local-dir models`);
    console.error();
    process.exit(1);
  }
}

// Executar apenas se não estiver em modo de publicação
if (process.env.npm_lifecycle_event !== 'prepublishOnly') {
  downloadModel().catch(err => {
    console.error('Erro no download do modelo:', err);
    process.exit(0); // Não falhar npm install
  });
}


