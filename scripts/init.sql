-- OmniFix PostgreSQL Schema Initialization

CREATE TABLE IF NOT EXISTS workflows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     VARCHAR(36) UNIQUE NOT NULL,
    workflow_name   VARCHAR(100) NOT NULL,
    task            TEXT,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    confidence      DECIMAL(5,4),
    steps_completed INTEGER DEFAULT 0,
    total_steps     INTEGER DEFAULT 0,
    tokens_used     INTEGER DEFAULT 0,
    hitl_required   BOOLEAN DEFAULT FALSE,
    healed          BOOLEAN DEFAULT FALSE,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS execution_steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     VARCHAR(36) REFERENCES workflows(workflow_id),
    step_index      INTEGER NOT NULL,
    step_name       VARCHAR(200) NOT NULL,
    agent_type      VARCHAR(100) NOT NULL,
    status          VARCHAR(50) NOT NULL,
    confidence      DECIMAL(5,4),
    latency_ms      DECIMAL(10,2),
    tokens_used     INTEGER DEFAULT 0,
    error           TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_telemetry (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     VARCHAR(36),
    agent_id        VARCHAR(100) NOT NULL,
    agent_type      VARCHAR(100) NOT NULL,
    tokens_used     INTEGER DEFAULT 0,
    latency_ms      DECIMAL(10,2),
    confidence      DECIMAL(5,4),
    tool_calls      TEXT[],
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS error_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     VARCHAR(36),
    step_name       VARCHAR(200),
    error_type      VARCHAR(100),
    error_message   TEXT,
    recovery_applied VARCHAR(100),
    healed          BOOLEAN DEFAULT FALSE,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_name ON workflows(workflow_name);
CREATE INDEX IF NOT EXISTS idx_steps_workflow ON execution_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_workflow ON agent_telemetry(workflow_id);
