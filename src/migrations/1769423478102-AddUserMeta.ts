import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserMeta1769423478102 implements MigrationInterface {
  name = 'AddUserMeta1769423478102';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "user"
            ADD "is_blocked_by_user" boolean NOT NULL DEFAULT false
        `);
    await queryRunner.query(`
            ALTER TABLE "user"
            ADD "last_interaction_at" TIMESTAMP
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN "last_interaction_at"
        `);
    await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN "is_blocked_by_user"
        `);
  }
}
