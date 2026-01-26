import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStuckNotifications1769416460674 implements MigrationInterface {
  name = 'AddStuckNotifications1769416460674';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "payments"
            ADD "stuck_notification_sent" boolean NOT NULL DEFAULT false
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "payments" DROP COLUMN "stuck_notification_sent"
        `);
  }
}
