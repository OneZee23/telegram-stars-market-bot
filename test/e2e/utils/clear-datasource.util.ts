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
    await dataSource.query(
      `TRUNCATE TABLE "${repository.metadata.tableName}" CASCADE `,
    );
  }

  if (userService) {
    const cache = (userService as any).userCache;
    if (cache && cache instanceof Map) {
      cache.clear();
    }
  }
}
