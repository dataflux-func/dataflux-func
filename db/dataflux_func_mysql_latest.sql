DROP TABLE IF EXISTS `biz_main_api_auth`;
CREATE TABLE `biz_main_api_auth` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(256) DEFAULT NULL,
  `type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `funcId` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `configJSON` longtext NOT NULL,
  `note` text,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_async_api`;
CREATE TABLE `biz_main_async_api` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `funcId` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `funcCallKwargsJSON` longtext DEFAULT NULL,
  `tagsJSON` longtext DEFAULT NULL,
  `apiAuthId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `expireTime` bigint(20) unsigned DEFAULT NULL,
  `throttlingJSON` longtext DEFAULT NULL,
  `origin` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'UNKNOWN',
  `originId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'UNKNOWN',
  `showInDoc` tinyint(1) NOT NULL DEFAULT 0,
  `taskRecordLimit` int(11) DEFAULT NULL,
  `isDisabled` tinyint(1) NOT NULL DEFAULT 0,
  `note` text,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  KEY `ORIGIN` (`origin`),
  KEY `ORIGIN_ID` (`originId`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_blueprint`;
CREATE TABLE `biz_main_blueprint` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(256) DEFAULT NULL,
  `description` text,
  `canvasJSON` longtext NOT NULL,
  `viewJSON` longtext NOT NULL,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_connector`;
CREATE TABLE `biz_main_connector` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(256) DEFAULT NULL,
  `description` text,
  `type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `configJSON` longtext NOT NULL,
  `isBuiltin` tinyint(1) NOT NULL DEFAULT 0,
  `pinTime` bigint(20) unsigned DEFAULT NULL,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_cron_job`;
CREATE TABLE `biz_main_cron_job` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `funcId` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `funcCallKwargsJSON` longtext DEFAULT NULL,
  `cronExpr` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `timezone` varchar(256) DEFAULT NULL,
  `tagsJSON` longtext DEFAULT NULL,
  `scope` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'GLOBAL',
  `configMD5` char(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `expireTime` bigint(20) unsigned DEFAULT NULL,
  `origin` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'UNKNOWN',
  `originId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'UNKNOWN',
  `taskRecordLimit` int(11) DEFAULT NULL,
  `isDisabled` tinyint(1) NOT NULL DEFAULT 0,
  `note` text,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  UNIQUE KEY `SCOPE_CONFIG` (`scope`,`configMD5`),
  KEY `ORIGIN` (`origin`),
  KEY `ORIGIN_ID` (`originId`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_env_variable`;
CREATE TABLE `biz_main_env_variable` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(256) DEFAULT NULL,
  `description` text,
  `autoTypeCasting` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'string',
  `valueTEXT` longtext NOT NULL,
  `pinTime` bigint(20) unsigned DEFAULT NULL,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_file_service`;
CREATE TABLE `biz_main_file_service` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `root` text,
  `isDisabled` tinyint(1) NOT NULL DEFAULT 0,
  `note` text,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_func`;
CREATE TABLE `biz_main_func` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `scriptSetId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `scriptId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(256) DEFAULT NULL,
  `description` text,
  `definition` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `argsJSON` longtext DEFAULT NULL,
  `kwargsJSON` longtext DEFAULT NULL,
  `extraConfigJSON` longtext DEFAULT NULL,
  `category` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'general',
  `integration` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `tagsJSON` longtext DEFAULT NULL,
  `defOrder` int(11) NOT NULL DEFAULT 0,
  `isHidden` tinyint(1) NOT NULL DEFAULT 0,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  KEY `SCRIPT_SET_ID` (`scriptSetId`),
  KEY `SCRIPT_ID` (`scriptId`),
  KEY `NAME` (`name`),
  KEY `CATEGORY` (`category`),
  KEY `INTEGRATION` (`integration`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_func_store`;
CREATE TABLE `biz_main_func_store` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `scope` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'GLOBAL',
  `key` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `valueJSON` longtext NOT NULL,
  `expireAt` int(11) DEFAULT NULL,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  UNIQUE KEY `BIZ` (`scope`,`key`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_operation_record`;
CREATE TABLE `biz_main_operation_record` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `userId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `username` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `clientId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `clientIPsJSON` longtext DEFAULT NULL,
  `traceId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `reqMethod` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `reqRoute` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `reqQueryJSON` longtext DEFAULT NULL,
  `reqParamsJSON` longtext DEFAULT NULL,
  `reqBodyJSON` longtext DEFAULT NULL,
  `reqFileInfoJSON` longtext DEFAULT NULL,
  `reqCost` int(11) DEFAULT NULL,
  `respStatusCode` int(3) unsigned DEFAULT NULL,
  `respBodyJSON` longtext DEFAULT NULL,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  KEY `USER_ID` (`userId`),
  KEY `USERNAME` (`username`),
  KEY `CLIENT_ID` (`clientId`),
  KEY `TRACE_ID` (`traceId`),
  KEY `REQ_METHOD` (`reqMethod`),
  KEY `REQ_ROUTE` (`reqRoute`),
  KEY `CREATE_TIME` (`createTime`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_script`;
CREATE TABLE `biz_main_script` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `scriptSetId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(256) DEFAULT NULL,
  `description` text,
  `publishVersion` bigint(20) NOT NULL DEFAULT 0,
  `type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'python',
  `code` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `codeMD5` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `codeDraft` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `codeDraftMD5` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `lockedByUserId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `lockConfigJSON` longtext,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  KEY `SCRIPT_SET_ID` (`scriptSetId`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_script_market`;
CREATE TABLE `biz_main_script_market` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(256) DEFAULT NULL,
  `description` text,
  `type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `configJSON` longtext DEFAULT NULL,
  `extraJSON` longtext DEFAULT NULL,
  `lockedByUserId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `lockConfigJSON` longtext,
  `pinTime` bigint(20) unsigned DEFAULT NULL,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_script_publish_history`;
CREATE TABLE `biz_main_script_publish_history` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `scriptId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `scriptPublishVersion` bigint(20) NOT NULL,
  `scriptCode_cache` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `note` text,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  KEY `SCRIPT_ID` (`scriptId`),
  KEY `SCRIPT_PUBLISH_VERSION` (`scriptPublishVersion`),
  KEY `CREATE_TIME` (`createTime`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_script_recover_point`;
CREATE TABLE `biz_main_script_recover_point` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'manual',
  `tableDumpJSON` longtext DEFAULT NULL,
  `exportData` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `note` text,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_script_set`;
CREATE TABLE `biz_main_script_set` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(256) DEFAULT NULL,
  `description` text,
  `requirements` text,
  `origin` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'UNKNOWN',
  `originId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'UNKNOWN',
  `originMD5` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `lockedByUserId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `lockConfigJSON` longtext,
  `pinTime` bigint(20) unsigned DEFAULT NULL,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  KEY `ORIGIN_ID` (`originId`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_script_set_export_history`;
CREATE TABLE `biz_main_script_set_export_history` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `note` text,
  `summaryJSON` longtext NOT NULL,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_script_set_import_history`;
CREATE TABLE `biz_main_script_set_import_history` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `note` text,
  `summaryJSON` longtext NOT NULL,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_sync_api`;
CREATE TABLE `biz_main_sync_api` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `funcId` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `funcCallKwargsJSON` longtext DEFAULT NULL,
  `tagsJSON` longtext DEFAULT NULL,
  `apiAuthId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `expireTime` bigint(20) unsigned DEFAULT NULL,
  `throttlingJSON` longtext DEFAULT NULL,
  `origin` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'UNKNOWN',
  `originId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'UNKNOWN',
  `showInDoc` tinyint(1) NOT NULL DEFAULT 0,
  `taskRecordLimit` int(11) DEFAULT NULL,
  `isDisabled` tinyint(1) NOT NULL DEFAULT 0,
  `note` text,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  KEY `ORIGIN` (`origin`),
  KEY `ORIGIN_ID` (`originId`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_task_record`;
CREATE TABLE `biz_main_task_record` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `kwargsJSON` longtext DEFAULT NULL,
  `triggerTimeMs` bigint(20) unsigned NOT NULL,
  `startTimeMs` bigint(20) unsigned NOT NULL,
  `endTimeMs` bigint(20) unsigned NOT NULL,
  `eta` text,
  `delay` bigint(20) unsigned NOT NULL,
  `queue` bigint(20) unsigned NOT NULL,
  `timeout` bigint(20) unsigned NOT NULL,
  `expires` bigint(20) unsigned NOT NULL,
  `ignoreResult` tinyint(1) NOT NULL,
  `resultJSON` longtext DEFAULT NULL,
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `exceptionType` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `exceptionTEXT` longtext,
  `tracebackTEXT` longtext,
  `nonCriticalErrorsTEXT` longtext,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  KEY `NAME` (`name`),
  KEY `TRIGGER_TIME_MS` (`triggerTimeMs`),
  KEY `QUEUE` (`queue`),
  KEY `STATUS` (`status`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `biz_main_task_record_func`;
CREATE TABLE `biz_main_task_record_func` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `rootTaskId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT 'ROOT',
  `scriptSetId` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `scriptId` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `funcId` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `funcCallKwargsJSON` longtext DEFAULT NULL,
  `origin` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'UNKNOWN',
  `originId` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'UNKNOWN',
  `cronExpr` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `callChainJSON` longtext DEFAULT NULL,
  `triggerTimeMs` bigint(20) unsigned NOT NULL,
  `startTimeMs` bigint(20) unsigned NOT NULL,
  `endTimeMs` bigint(20) unsigned NOT NULL,
  `eta` text,
  `delay` bigint(20) unsigned NOT NULL,
  `queue` bigint(20) unsigned NOT NULL,
  `timeout` bigint(20) unsigned NOT NULL,
  `expires` bigint(20) unsigned NOT NULL,
  `ignoreResult` tinyint(1) NOT NULL,
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `exceptionType` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `exceptionTEXT` longtext,
  `tracebackTEXT` longtext,
  `nonCriticalErrorsTEXT` longtext,
  `printLogsTEXT` longtext,
  `returnValueJSON` longtext DEFAULT NULL,
  `responseControlJSON` longtext DEFAULT NULL,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  KEY `ROOT_TASK_ID` (`rootTaskId`),
  KEY `SCRIPT_TASK_ID` (`scriptSetId`),
  KEY `SCRIPT_ID` (`scriptId`),
  KEY `FUNC_ID` (`funcId`),
  KEY `ORIGIN` (`origin`),
  KEY `ORIGIN_ID` (`originId`),
  KEY `TRIGGER_TIME_MS` (`triggerTimeMs`),
  KEY `QUEUE` (`queue`),
  KEY `STATUS` (`status`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `wat_main_access_key`;
CREATE TABLE `wat_main_access_key` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `userId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(256) NOT NULL,
  `secretCipher` longtext,
  `webhookURL` text,
  `webhookEvents` text,
  `allowWebhookEcho` tinyint(1) NOT NULL DEFAULT 0,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  KEY `USER_ID` (`userId`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `wat_main_system_setting`;
CREATE TABLE `wat_main_system_setting` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

DROP TABLE IF EXISTS `wat_main_user`;
CREATE TABLE `wat_main_user` (
  `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `username` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `passwordHash` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `name` varchar(256) DEFAULT NULL,
  `email` varchar(256) DEFAULT NULL,
  `mobile` varchar(32) DEFAULT NULL,
  `markers` text,
  `roles` text,
  `customPrivileges` text,
  `isDisabled` tinyint(1) NOT NULL DEFAULT 0,
  `createTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updateTime` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq`),
  UNIQUE KEY `ID` (`id`),
  UNIQUE KEY `USERNAME` (`username`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
