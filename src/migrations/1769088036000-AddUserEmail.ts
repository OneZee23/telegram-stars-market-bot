import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserEmail1769088036000 implements MigrationInterface {
  name = 'AddUserEmail1769088036000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "user" ADD COLUMN "email" character varying
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN "email"
        `);
  }
}
