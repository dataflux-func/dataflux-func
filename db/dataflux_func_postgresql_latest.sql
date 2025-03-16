DROP TABLE IF EXISTS "biz_main_api_auth";
CREATE TABLE "biz_main_api_auth" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "title" varchar(256) DEFAULT NULL,
  "type" varchar(64) NOT NULL,
  "funcId" varchar(256) DEFAULT NULL,
  "configJSON" TEXT NOT NULL,
  "note" text,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_api_auth_ID" ON "biz_main_api_auth" ("id");

DROP TABLE IF EXISTS "biz_main_async_api";
CREATE TABLE "biz_main_async_api" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "funcId" varchar(256) NOT NULL,
  "funcCallKwargsJSON" TEXT DEFAULT NULL,
  "tagsJSON" TEXT DEFAULT NULL,
  "apiAuthId" varchar(64) DEFAULT NULL,
  "expireTime" BIGINT DEFAULT NULL,
  "throttlingJSON" TEXT DEFAULT NULL,
  "origin" varchar(64) NOT NULL DEFAULT 'UNKNOWN',
  "originId" varchar(64) NOT NULL DEFAULT 'UNKNOWN',
  "showInDoc" SMALLINT NOT NULL DEFAULT 0,
  "taskRecordLimit" INT DEFAULT NULL,
  "isDisabled" SMALLINT NOT NULL DEFAULT 0,
  "note" text,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_async_api_ID" ON "biz_main_async_api" ("id");
CREATE INDEX "biz_main_async_api_ORIGIN" ON "biz_main_async_api" ("origin");
CREATE INDEX "biz_main_async_api_ORIGIN_ID" ON "biz_main_async_api" ("originId");

DROP TABLE IF EXISTS "biz_main_blueprint";
CREATE TABLE "biz_main_blueprint" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "title" varchar(256) DEFAULT NULL,
  "description" text,
  "canvasJSON" TEXT NOT NULL,
  "viewJSON" TEXT NOT NULL,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_blueprint_ID" ON "biz_main_blueprint" ("id");

DROP TABLE IF EXISTS "biz_main_connector";
CREATE TABLE "biz_main_connector" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "title" varchar(256) DEFAULT NULL,
  "description" text,
  "type" varchar(64) NOT NULL,
  "configJSON" TEXT NOT NULL,
  "isBuiltin" SMALLINT NOT NULL DEFAULT 0,
  "pinTime" BIGINT DEFAULT NULL,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_connector_ID" ON "biz_main_connector" ("id");

DROP TABLE IF EXISTS "biz_main_cron_job";
CREATE TABLE "biz_main_cron_job" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "funcId" varchar(256) NOT NULL,
  "funcCallKwargsJSON" TEXT DEFAULT NULL,
  "cronExpr" varchar(64) DEFAULT NULL,
  "timezone" varchar(256) DEFAULT NULL,
  "tagsJSON" TEXT DEFAULT NULL,
  "scope" varchar(256) NOT NULL DEFAULT 'GLOBAL',
  "configMD5" char(32) DEFAULT NULL,
  "expireTime" BIGINT DEFAULT NULL,
  "origin" varchar(64) NOT NULL DEFAULT 'UNKNOWN',
  "originId" varchar(64) NOT NULL DEFAULT 'UNKNOWN',
  "taskRecordLimit" INT DEFAULT NULL,
  "isDisabled" SMALLINT NOT NULL DEFAULT 0,
  "note" text,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_cron_job_ID" ON "biz_main_cron_job" ("id");
CREATE UNIQUE INDEX "biz_main_cron_job_SCOPE_CONFIG" ON "biz_main_cron_job" ("scope","configMD5");
CREATE INDEX "biz_main_cron_job_ORIGIN" ON "biz_main_cron_job" ("origin");
CREATE INDEX "biz_main_cron_job_ORIGIN_ID" ON "biz_main_cron_job" ("originId");

DROP TABLE IF EXISTS "biz_main_env_variable";
CREATE TABLE "biz_main_env_variable" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "title" varchar(256) DEFAULT NULL,
  "description" text,
  "autoTypeCasting" varchar(64) NOT NULL DEFAULT 'string',
  "valueTEXT" TEXT NOT NULL,
  "pinTime" BIGINT DEFAULT NULL,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_env_variable_ID" ON "biz_main_env_variable" ("id");

DROP TABLE IF EXISTS "biz_main_file_service";
CREATE TABLE "biz_main_file_service" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "root" text,
  "isDisabled" SMALLINT NOT NULL DEFAULT 0,
  "note" text,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_file_service_ID" ON "biz_main_file_service" ("id");

DROP TABLE IF EXISTS "biz_main_func";
CREATE TABLE "biz_main_func" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(256) NOT NULL,
  "scriptSetId" varchar(64) NOT NULL,
  "scriptId" varchar(64) NOT NULL,
  "name" varchar(64) NOT NULL,
  "title" varchar(256) DEFAULT NULL,
  "description" text,
  "definition" text NOT NULL,
  "argsJSON" TEXT DEFAULT NULL,
  "kwargsJSON" TEXT DEFAULT NULL,
  "extraConfigJSON" TEXT DEFAULT NULL,
  "category" varchar(64) NOT NULL DEFAULT 'general',
  "integration" varchar(64) DEFAULT NULL,
  "tagsJSON" TEXT DEFAULT NULL,
  "defOrder" INT NOT NULL DEFAULT 0,
  "isHidden" SMALLINT NOT NULL DEFAULT 0,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_func_ID" ON "biz_main_func" ("id");
CREATE INDEX "biz_main_func_SCRIPT_SET_ID" ON "biz_main_func" ("scriptSetId");
CREATE INDEX "biz_main_func_SCRIPT_ID" ON "biz_main_func" ("scriptId");
CREATE INDEX "biz_main_func_NAME" ON "biz_main_func" ("name");
CREATE INDEX "biz_main_func_CATEGORY" ON "biz_main_func" ("category");
CREATE INDEX "biz_main_func_INTEGRATION" ON "biz_main_func" ("integration");

DROP TABLE IF EXISTS "biz_main_func_store";
CREATE TABLE "biz_main_func_store" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "scope" varchar(256) NOT NULL DEFAULT 'GLOBAL',
  "key" varchar(256) NOT NULL,
  "valueJSON" TEXT NOT NULL,
  "expireAt" INT DEFAULT NULL,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_func_store_ID" ON "biz_main_func_store" ("id");
CREATE UNIQUE INDEX "biz_main_func_store_BIZ" ON "biz_main_func_store" ("scope","key");

DROP TABLE IF EXISTS "biz_main_operation_record";
CREATE TABLE "biz_main_operation_record" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "userId" varchar(64) DEFAULT NULL,
  "username" varchar(128) DEFAULT NULL,
  "clientId" varchar(128) DEFAULT NULL,
  "clientIPsJSON" TEXT DEFAULT NULL,
  "traceId" varchar(128) DEFAULT NULL,
  "reqMethod" varchar(64) DEFAULT NULL,
  "reqRoute" varchar(256) DEFAULT NULL,
  "reqQueryJSON" TEXT DEFAULT NULL,
  "reqParamsJSON" TEXT DEFAULT NULL,
  "reqBodyJSON" TEXT DEFAULT NULL,
  "reqFileInfoJSON" TEXT DEFAULT NULL,
  "reqCost" INT DEFAULT NULL,
  "respStatusCode" INT DEFAULT NULL,
  "respBodyJSON" TEXT DEFAULT NULL,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_operation_record_ID" ON "biz_main_operation_record" ("id");
CREATE INDEX "biz_main_operation_record_USER_ID" ON "biz_main_operation_record" ("userId");
CREATE INDEX "biz_main_operation_record_USERNAME" ON "biz_main_operation_record" ("username");
CREATE INDEX "biz_main_operation_record_CLIENT_ID" ON "biz_main_operation_record" ("clientId");
CREATE INDEX "biz_main_operation_record_TRACE_ID" ON "biz_main_operation_record" ("traceId");
CREATE INDEX "biz_main_operation_record_REQ_METHOD" ON "biz_main_operation_record" ("reqMethod");
CREATE INDEX "biz_main_operation_record_REQ_ROUTE" ON "biz_main_operation_record" ("reqRoute");
CREATE INDEX "biz_main_operation_record_CREATE_TIME" ON "biz_main_operation_record" ("createTime");

DROP TABLE IF EXISTS "biz_main_script";
CREATE TABLE "biz_main_script" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "scriptSetId" varchar(64) NOT NULL,
  "title" varchar(256) DEFAULT NULL,
  "description" text,
  "publishVersion" BIGINT NOT NULL DEFAULT 0,
  "type" varchar(64) NOT NULL DEFAULT 'python',
  "code" TEXT,
  "codeMD5" varchar(64) DEFAULT NULL,
  "codeDraft" TEXT,
  "codeDraftMD5" varchar(64) DEFAULT NULL,
  "lockedByUserId" varchar(64) DEFAULT NULL,
  "lockConfigJSON" TEXT,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_script_ID" ON "biz_main_script" ("id");
CREATE INDEX "biz_main_script_SCRIPT_SET_ID" ON "biz_main_script" ("scriptSetId");

DROP TABLE IF EXISTS "biz_main_script_market";
CREATE TABLE "biz_main_script_market" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "title" varchar(256) DEFAULT NULL,
  "description" text,
  "type" varchar(64) NOT NULL,
  "configJSON" TEXT DEFAULT NULL,
  "extraJSON" TEXT DEFAULT NULL,
  "lockedByUserId" varchar(64) DEFAULT NULL,
  "lockConfigJSON" TEXT,
  "pinTime" BIGINT DEFAULT NULL,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_script_market_ID" ON "biz_main_script_market" ("id");

DROP TABLE IF EXISTS "biz_main_script_publish_history";
CREATE TABLE "biz_main_script_publish_history" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "scriptId" varchar(64) NOT NULL,
  "scriptPublishVersion" BIGINT NOT NULL,
  "scriptCode_cache" TEXT NOT NULL,
  "note" text,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_script_publish_history_ID" ON "biz_main_script_publish_history" ("id");
CREATE INDEX "biz_main_script_publish_history_SCRIPT_ID" ON "biz_main_script_publish_history" ("scriptId");
CREATE INDEX "biz_main_script_publish_history_SCRIPT_PUBLISH_VERSION" ON "biz_main_script_publish_history" ("scriptPublishVersion");
CREATE INDEX "biz_main_script_publish_history_CREATE_TIME" ON "biz_main_script_publish_history" ("createTime");

DROP TABLE IF EXISTS "biz_main_script_recover_point";
CREATE TABLE "biz_main_script_recover_point" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "type" varchar(64) NOT NULL DEFAULT 'manual',
  "tableDumpJSON" TEXT DEFAULT NULL,
  "exportData" TEXT,
  "note" text,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_script_recover_point_ID" ON "biz_main_script_recover_point" ("id");

DROP TABLE IF EXISTS "biz_main_script_set";
CREATE TABLE "biz_main_script_set" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "title" varchar(256) DEFAULT NULL,
  "description" text,
  "requirements" text,
  "origin" varchar(64) NOT NULL DEFAULT 'UNKNOWN',
  "originId" varchar(64) NOT NULL DEFAULT 'UNKNOWN',
  "originMD5" varchar(64) DEFAULT NULL,
  "lockedByUserId" varchar(64) DEFAULT NULL,
  "lockConfigJSON" TEXT,
  "pinTime" BIGINT DEFAULT NULL,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_script_set_ID" ON "biz_main_script_set" ("id");
CREATE INDEX "biz_main_script_set_ORIGIN_ID" ON "biz_main_script_set" ("originId");

DROP TABLE IF EXISTS "biz_main_script_set_export_history";
CREATE TABLE "biz_main_script_set_export_history" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "note" text,
  "summaryJSON" TEXT NOT NULL,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_script_set_export_history_ID" ON "biz_main_script_set_export_history" ("id");

DROP TABLE IF EXISTS "biz_main_script_set_import_history";
CREATE TABLE "biz_main_script_set_import_history" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "note" text,
  "summaryJSON" TEXT NOT NULL,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_script_set_import_history_ID" ON "biz_main_script_set_import_history" ("id");

DROP TABLE IF EXISTS "biz_main_sync_api";
CREATE TABLE "biz_main_sync_api" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "funcId" varchar(256) NOT NULL,
  "funcCallKwargsJSON" TEXT DEFAULT NULL,
  "tagsJSON" TEXT DEFAULT NULL,
  "apiAuthId" varchar(64) DEFAULT NULL,
  "expireTime" BIGINT DEFAULT NULL,
  "throttlingJSON" TEXT DEFAULT NULL,
  "origin" varchar(64) NOT NULL DEFAULT 'UNKNOWN',
  "originId" varchar(64) NOT NULL DEFAULT 'UNKNOWN',
  "showInDoc" SMALLINT NOT NULL DEFAULT 0,
  "taskRecordLimit" INT DEFAULT NULL,
  "isDisabled" SMALLINT NOT NULL DEFAULT 0,
  "note" text,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_sync_api_ID" ON "biz_main_sync_api" ("id");
CREATE INDEX "biz_main_sync_api_ORIGIN" ON "biz_main_sync_api" ("origin");
CREATE INDEX "biz_main_sync_api_ORIGIN_ID" ON "biz_main_sync_api" ("originId");

DROP TABLE IF EXISTS "biz_main_task_record";
CREATE TABLE "biz_main_task_record" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "name" varchar(64) NOT NULL,
  "kwargsJSON" TEXT DEFAULT NULL,
  "triggerTimeMs" BIGINT NOT NULL,
  "startTimeMs" BIGINT NOT NULL,
  "endTimeMs" BIGINT NOT NULL,
  "eta" text,
  "delay" BIGINT NOT NULL,
  "queue" BIGINT NOT NULL,
  "timeout" BIGINT NOT NULL,
  "expires" BIGINT NOT NULL,
  "ignoreResult" SMALLINT NOT NULL,
  "resultJSON" TEXT DEFAULT NULL,
  "status" varchar(64) NOT NULL,
  "exceptionType" varchar(128) DEFAULT NULL,
  "exceptionTEXT" TEXT,
  "tracebackTEXT" TEXT,
  "nonCriticalErrorsTEXT" TEXT,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_task_record_ID" ON "biz_main_task_record" ("id");
CREATE INDEX "biz_main_task_record_NAME" ON "biz_main_task_record" ("name");
CREATE INDEX "biz_main_task_record_TRIGGER_TIME_MS" ON "biz_main_task_record" ("triggerTimeMs");
CREATE INDEX "biz_main_task_record_QUEUE" ON "biz_main_task_record" ("queue");
CREATE INDEX "biz_main_task_record_STATUS" ON "biz_main_task_record" ("status");

DROP TABLE IF EXISTS "biz_main_task_record_func";
CREATE TABLE "biz_main_task_record_func" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "rootTaskId" varchar(64) DEFAULT 'ROOT',
  "scriptSetId" varchar(256) NOT NULL,
  "scriptId" varchar(256) NOT NULL,
  "funcId" varchar(256) NOT NULL,
  "funcCallKwargsJSON" TEXT DEFAULT NULL,
  "origin" varchar(64) NOT NULL DEFAULT 'UNKNOWN',
  "originId" varchar(256) NOT NULL DEFAULT 'UNKNOWN',
  "cronExpr" varchar(64) DEFAULT NULL,
  "callChainJSON" TEXT DEFAULT NULL,
  "triggerTimeMs" BIGINT NOT NULL,
  "startTimeMs" BIGINT NOT NULL,
  "endTimeMs" BIGINT NOT NULL,
  "eta" text,
  "delay" BIGINT NOT NULL,
  "queue" BIGINT NOT NULL,
  "timeout" BIGINT NOT NULL,
  "expires" BIGINT NOT NULL,
  "ignoreResult" SMALLINT NOT NULL,
  "status" varchar(64) NOT NULL,
  "exceptionType" varchar(128) DEFAULT NULL,
  "exceptionTEXT" TEXT,
  "tracebackTEXT" TEXT,
  "nonCriticalErrorsTEXT" TEXT,
  "printLogsTEXT" TEXT,
  "returnValueJSON" TEXT DEFAULT NULL,
  "responseControlJSON" TEXT DEFAULT NULL,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "biz_main_task_record_func_ID" ON "biz_main_task_record_func" ("id");
CREATE INDEX "biz_main_task_record_func_ROOT_TASK_ID" ON "biz_main_task_record_func" ("rootTaskId");
CREATE INDEX "biz_main_task_record_func_SCRIPT_TASK_ID" ON "biz_main_task_record_func" ("scriptSetId");
CREATE INDEX "biz_main_task_record_func_SCRIPT_ID" ON "biz_main_task_record_func" ("scriptId");
CREATE INDEX "biz_main_task_record_func_FUNC_ID" ON "biz_main_task_record_func" ("funcId");
CREATE INDEX "biz_main_task_record_func_ORIGIN" ON "biz_main_task_record_func" ("origin");
CREATE INDEX "biz_main_task_record_func_ORIGIN_ID" ON "biz_main_task_record_func" ("originId");
CREATE INDEX "biz_main_task_record_func_TRIGGER_TIME_MS" ON "biz_main_task_record_func" ("triggerTimeMs");
CREATE INDEX "biz_main_task_record_func_QUEUE" ON "biz_main_task_record_func" ("queue");
CREATE INDEX "biz_main_task_record_func_STATUS" ON "biz_main_task_record_func" ("status");

DROP TABLE IF EXISTS "wat_main_access_key";
CREATE TABLE "wat_main_access_key" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "userId" varchar(64) NOT NULL,
  "title" varchar(256) NOT NULL,
  "secretCipher" TEXT,
  "webhookURL" text,
  "webhookEvents" text,
  "allowWebhookEcho" SMALLINT NOT NULL DEFAULT 0,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "wat_main_access_key_ID" ON "wat_main_access_key" ("id");
CREATE INDEX "wat_main_access_key_USER_ID" ON "wat_main_access_key" ("userId");

DROP TABLE IF EXISTS "wat_main_system_setting";
CREATE TABLE "wat_main_system_setting" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "value" TEXT NOT NULL,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "wat_main_system_setting_ID" ON "wat_main_system_setting" ("id");

DROP TABLE IF EXISTS "wat_main_user";
CREATE TABLE "wat_main_user" (
  "seq" BIGSERIAL NOT NULL,
  "id" varchar(64) NOT NULL,
  "username" varchar(64) NOT NULL,
  "passwordHash" text,
  "name" varchar(256) DEFAULT NULL,
  "email" varchar(256) DEFAULT NULL,
  "mobile" varchar(32) DEFAULT NULL,
  "markers" text,
  "roles" text,
  "customPrivileges" text,
  "isDisabled" SMALLINT NOT NULL DEFAULT 0,
  "createTime" BIGINT NOT NULL DEFAULT 0,
  "updateTime" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("seq")
);
CREATE UNIQUE INDEX "wat_main_user_ID" ON "wat_main_user" ("id");
CREATE UNIQUE INDEX "wat_main_user_USERNAME" ON "wat_main_user" ("username");
