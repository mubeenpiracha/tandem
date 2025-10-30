-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "user_id" TEXT,
    "workspace_id" TEXT,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "details" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" TEXT,
    "risk_level" TEXT NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_event_type_timestamp_idx" ON "audit_logs"("event_type", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_timestamp_idx" ON "audit_logs"("workspace_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_timestamp_idx" ON "audit_logs"("user_id", "timestamp");
