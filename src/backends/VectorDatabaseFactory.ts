import type { IVectorDatabase, IVectorDatabaseFactory, VectorDatabaseConfig } from '../interfaces/IVectorDatabase';
import { MemoryVectorDatabase } from './MemoryVectorDatabase';
import { PostgresVectorDatabase } from './PostgresVectorDatabase';

/**
 * Factory for creating vector database instances
 * Supports: postgres (default), memory (testing)
 */
export class VectorDatabaseFactory implements IVectorDatabaseFactory {
  async create(config: VectorDatabaseConfig): Promise<IVectorDatabase> {
    switch (config.type) {
      case 'memory':
        return new MemoryVectorDatabase();

      case 'postgres':
        return new PostgresVectorDatabase();

      default:
        throw new Error(`Unknown vector database type: ${config.type}. Supported: postgres, memory`);
    }
  }

  /**
   * Create a default vector database (Postgres)
   */
  async createDefault(_storagePath?: string): Promise<IVectorDatabase> {
    return new PostgresVectorDatabase();
  }
}
