/*
  Warnings:

  - A unique constraint covering the columns `[slack_message_id,workspace_id]` on the table `slack_messages` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email,workspace_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slack_user_id,workspace_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `workspace_id` to the `slack_messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workspace_id` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."slack_messages_slack_message_id_key";

-- DropIndex
DROP INDEX "public"."users_email_key";

-- DropIndex
DROP INDEX "public"."users_slack_user_id_key";

-- AlterTable
ALTER TABLE "slack_messages" ADD COLUMN     "workspace_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "workspace_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "slack_team_id" TEXT NOT NULL,
    "slack_team_name" TEXT NOT NULL,
    "slack_bot_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slack_team_id_key" ON "workspaces"("slack_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "slack_messages_slack_message_id_workspace_id_key" ON "slack_messages"("slack_message_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_workspace_id_key" ON "users"("email", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_slack_user_id_workspace_id_key" ON "users"("slack_user_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_messages" ADD CONSTRAINT "slack_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
