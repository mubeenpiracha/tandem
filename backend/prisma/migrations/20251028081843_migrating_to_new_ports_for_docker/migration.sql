-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "TaskImportance" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('DETECTED', 'PROCESSED', 'IGNORED', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" TIMESTAMP(3),
    "estimated_duration" INTEGER NOT NULL,
    "importance" "TaskImportance" NOT NULL DEFAULT 'MEDIUM',
    "derived_urgency" "TaskUrgency" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "slack_message_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "google_event_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_messages" (
    "id" TEXT NOT NULL,
    "slack_message_id" TEXT NOT NULL,
    "slack_channel_id" TEXT NOT NULL,
    "slack_thread_id" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'DETECTED',
    "message_timestamp" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "slack_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "weekly_hours" JSONB NOT NULL,
    "break_times" JSONB NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_slack_user_id_key" ON "users"("slack_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_task_id_key" ON "calendar_events"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_google_event_id_key" ON "calendar_events"("google_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "slack_messages_slack_message_id_key" ON "slack_messages"("slack_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_preferences_user_id_key" ON "work_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "slack_tokens_user_id_key" ON "slack_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_tokens_user_id_key" ON "google_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_slack_message_id_fkey" FOREIGN KEY ("slack_message_id") REFERENCES "slack_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_preferences" ADD CONSTRAINT "work_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_tokens" ADD CONSTRAINT "slack_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_tokens" ADD CONSTRAINT "google_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
