import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * Configuração automatizada para Ollama Cloud
 * Ajuda a configurar a API key e variáveis de ambiente
 */

/**
 * Verifica se a API key do Ollama Cloud está configurada
 */
export function hasOllamaCloudApiKey(): boolean {
  return !!process.env.OLLAMA_API_KEY;
}

/**
 * Obtém a API key do Ollama Cloud (se configurada)
 */
export function getOllamaCloudApiKey(): string | undefined {
  return process.env.OLLAMA_API_KEY;
}

/**
 * Configura a API key do Ollama Cloud no ambiente atual
 * (apenas para a sessão atual, não persiste)
 */
export function setOllamaCloudApiKey(apiKey: string): void {
  process.env.OLLAMA_API_KEY = apiKey;
}

/**
 * Configura a API key do Ollama Cloud em um arquivo .env
 * Cria ou atualiza o arquivo .env na raiz do projeto
 */
export function saveOllamaCloudApiKeyToEnv(apiKey: string, projectRoot?: string): void {
  const root = projectRoot || process.cwd();
  const envPath = path.join(root, '.env');

  let envContent = '';
  
  // Ler arquivo .env existente se houver
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  // Verificar se OLLAMA_API_KEY já existe
  const lines = envContent.split('\n');
  let found = false;
  const updatedLines = lines.map(line => {
    if (line.startsWith('OLLAMA_API_KEY=')) {
      found = true;
      return `OLLAMA_API_KEY=${apiKey}`;
    }
    return line;
  });

  // Se não encontrou, adicionar no final
  if (!found) {
    if (envContent && !envContent.endsWith('\n')) {
      updatedLines.push('');
    }
    updatedLines.push(`OLLAMA_API_KEY=${apiKey}`);
  }

  // Escrever arquivo .env
  fs.writeFileSync(envPath, updatedLines.join('\n'), 'utf-8');
  
  // Também configurar no ambiente atual
  setOllamaCloudApiKey(apiKey);
}

/**
 * Setup interativo para configurar Ollama Cloud
 * Pergunta ao usuário pela API key e salva no .env
 */
export async function setupOllamaCloudInteractive(projectRoot?: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => resolve(answer.trim()));
    });
  };

  try {
    console.log('\n🔐 Configuração do Ollama Cloud');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Para usar o Ollama Cloud, você precisa de uma API key.');
    console.log('Obtenha sua chave em: https://ollama.com/settings/keys\n');

    // Verificar se já existe
    const existingKey = getOllamaCloudApiKey();
    if (existingKey) {
      const useExisting = await question(
        `API key já configurada (${existingKey.substring(0, 8)}...). Usar esta? (s/n): `
      );
      if (useExisting.toLowerCase() === 's' || useExisting.toLowerCase() === 'y') {
        rl.close();
        return existingKey;
      }
    }

    // Solicitar nova API key
    const apiKey = await question('Digite sua API key do Ollama Cloud: ');
    
    if (!apiKey) {
      throw new Error('API key não pode ser vazia');
    }

    // Salvar no .env
    const saveToEnv = await question('Salvar no arquivo .env? (s/n): ');
    if (saveToEnv.toLowerCase() === 's' || saveToEnv.toLowerCase() === 'y') {
      saveOllamaCloudApiKeyToEnv(apiKey, projectRoot);
      console.log('✅ API key salva no arquivo .env');
    } else {
      // Apenas configurar na sessão atual
      setOllamaCloudApiKey(apiKey);
      console.log('✅ API key configurada para esta sessão (não persistida)');
    }

    rl.close();
    return apiKey;
  } catch (error) {
    rl.close();
    throw error;
  }
}

/**
 * Setup automatizado que tenta carregar do .env ou solicita interativamente
 */
export async function setupOllamaCloudAuto(projectRoot?: string): Promise<string | null> {
  const root = projectRoot || process.cwd();
  const envPath = path.join(root, '.env');

  // Tentar carregar do .env
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^OLLAMA_API_KEY=(.+)$/m);
    if (match && match[1]) {
      const apiKey = match[1].trim();
      setOllamaCloudApiKey(apiKey);
      return apiKey;
    }
  }

  // Se não encontrou, verificar variável de ambiente
  if (hasOllamaCloudApiKey()) {
    return getOllamaCloudApiKey()!;
  }

  // Se não encontrou em lugar nenhum, retornar null
  // (o usuário pode chamar setupOllamaCloudInteractive se quiser)
  return null;
}

/**
 * Valida se a API key do Ollama Cloud está funcionando
 */
export async function validateOllamaCloudApiKey(apiKey?: string): Promise<boolean> {
  const key = apiKey || getOllamaCloudApiKey();
  
  if (!key) {
    return false;
  }

  try {
    const response = await fetch('https://ollama.com/api/tags', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

