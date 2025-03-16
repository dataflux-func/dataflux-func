'use strict';

/* Project Modules */
var ROUTE       = require('../utils/yamlResources').get('ROUTE');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var routeLoader = require('../utils/routeLoader');

var mainAPICtrl = require('../controllers/mainAPICtrl');

// Overview
routeLoader.load(ROUTE.mainAPI.overview, [
  mainAPICtrl.overview,
]);

// Func
routeLoader.load(ROUTE.mainAPI.describeFunc, [
  mainAPICtrl.describeFunc,
]);

// Call Func directly
routeLoader.load(ROUTE.mainAPI.callFunc, [
  mainAPICtrl.callFunc,
]);

routeLoader.load(ROUTE.mainAPI.callFuncMany, [
  mainAPICtrl.callFuncMany,
]);

// Call Func via Sync API
routeLoader.load(ROUTE.mainAPI.callSyncAPIByGet, [
  mainAPICtrl.callSyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callSyncAPIByGetWithFormat, [
  mainAPICtrl.callSyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callSyncAPIByPost, [
  mainAPICtrl.callSyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callSyncAPIByPostWithFormat, [
  mainAPICtrl.callSyncAPI,
]);

// Call Func via Async API
routeLoader.load(ROUTE.mainAPI.callAsyncAPIByGet, [
  mainAPICtrl.callAsyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callAsyncAPIByGetWithFormat, [
  mainAPICtrl.callAsyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callAsyncAPIByPost, [
  mainAPICtrl.callAsyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callAsyncAPIByPostWithFormat, [
  mainAPICtrl.callAsyncAPI,
]);

// Trigger Cron Job manually
routeLoader.load(ROUTE.mainAPI.runCronJobManually, [
  mainAPICtrl.runCronJobManually,
]);

// Call Func draft
routeLoader.load(ROUTE.mainAPI.callFuncDraft, [
  mainAPICtrl.callFuncDraft,
]);

// Get Func doc (JSON format)
routeLoader.load(ROUTE.mainAPI.getFuncList, [
  mainAPICtrl.getFuncList,
]);

// Get Func tag list
routeLoader.load(ROUTE.mainAPI.getFuncTagList, [
  mainAPICtrl.getFuncTagList,
]);

// Get API doc (JSON format)
routeLoader.load(ROUTE.mainAPI.getFuncAPIList, [
  mainAPICtrl.getFuncAPIList,
]);

// Integrated Sign-in
routeLoader.load(ROUTE.mainAPI.integratedSignIn, [
  mainAPICtrl.integratedSignIn,
]);

// File Service
routeLoader.load(ROUTE.mainAPI.fileService, [
  mainAPICtrl.fileService,
]);

// Call Sync API
// NOTE [Compatibility] Auth Link was changed to Sync API
routeLoader.load(ROUTE.mainAPI.callAuthLinkByGet, [
  mainAPICtrl.callSyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callAuthLinkByGetWithFormat, [
  mainAPICtrl.callSyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callAuthLinkByPost, [
  mainAPICtrl.callSyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callAuthLinkByPostWithFormat, [
  mainAPICtrl.callSyncAPI,
]);

// Call Async API
// NOTE [Compatibility] Batch was changed to Async API
routeLoader.load(ROUTE.mainAPI.callBatchByGet, [
  mainAPICtrl.callAsyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callBatchByGetWithFormat, [
  mainAPICtrl.callAsyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callBatchByPost, [
  mainAPICtrl.callAsyncAPI,
]);
routeLoader.load(ROUTE.mainAPI.callBatchByPostWithFormat, [
  mainAPICtrl.callAsyncAPI,
]);

// Get Auth Link doc (JSON format)
routeLoader.load(ROUTE.mainAPI.getAuthLinkFuncList, [
  function(req, res, next) {
    req.query.apiType = 'syncAPI';
    return next();
  },
  mainAPICtrl.getFuncAPIList,
]);
