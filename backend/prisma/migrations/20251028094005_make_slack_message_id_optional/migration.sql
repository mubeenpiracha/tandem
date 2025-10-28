-- DropForeignKey
ALTER TABLE "public"."tasks" DROP CONSTRAINT "tasks_slack_message_id_fkey";

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "slack_message_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_slack_message_id_fkey" FOREIGN KEY ("slack_message_id") REFERENCES "slack_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
