import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexes1769333505733 implements MigrationInterface {
  name = 'AddIndexes1769333505733';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE INDEX "IDX_b1860320c2dc69422ee7242c6d" ON "payments" ("status", "updated_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_58620d2791557a4d0f44e87744" ON "payments" ("status", "created_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_1ac0f37c291f9ecb64ac921000" ON "stars_purchases" ("status")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."IDX_1ac0f37c291f9ecb64ac921000"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_58620d2791557a4d0f44e87744"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_b1860320c2dc69422ee7242c6d"
        `);
  }
}
