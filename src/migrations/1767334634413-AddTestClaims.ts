import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTestClaims1767334634413 implements MigrationInterface {
  name = 'AddTestClaims1767334634413';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "user"
            ADD "test_claims" integer NOT NULL DEFAULT '0'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN "test_claims"
        `);
  }
}
