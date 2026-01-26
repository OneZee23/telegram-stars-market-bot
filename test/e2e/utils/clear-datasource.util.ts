import { DataSource } from 'typeorm';
import { UserService } from '../../../src/modules/user/user.service';

export async function clearDatasource(
  dataSource: DataSource | undefined,
  userService?: UserService,
): Promise<void> {
  if (!dataSource) {
    return;
  }

  const entities = dataSource.entityMetadatas;

  for await (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    try {
      await dataSource.query(
        `TRUNCATE TABLE "${repository.metadata.tableName}" CASCADE `,
      );
    } catch (error) {
      // Ignore errors for tables that don't exist yet (before migration)
      const isTableNotExist =
        error instanceof Error &&
        error.message.includes('does not exist');
      if (!isTableNotExist) {
        throw error;
      }
    }
  }

  if (userService) {
    const cache = (userService as any).userCache;
    if (cache && cache instanceof Map) {
      cache.clear();
    }
  }
}
