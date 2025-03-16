'use strict';

/* Project Modules */
var ROUTE       = require('../utils/yamlResources').get('ROUTE');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var routeLoader = require('../utils/routeLoader');
var captcha     = require('../utils/captcha');
var apiDelay    = require('../utils/apiDelay');

var authAPICtrl = require('../controllers/authAPICtrl');

routeLoader.load(ROUTE.authAPI.signIn, [
  captcha.createVerifyCaptchaHandler('signIn'),
  apiDelay.createAPIDelayHandler('signIn', CONFIG._API_DEALY_TIMEOUT_SIGNIN),
  authAPICtrl.signIn,
]);

routeLoader.load(ROUTE.authAPI.signOut, [
  authAPICtrl.signOut,
]);

routeLoader.load(ROUTE.authAPI.changePassword, [
  captcha.createVerifyCaptchaHandler('changePassword'),
  authAPICtrl.changePassword,
]);

routeLoader.load(ROUTE.authAPI.profile, [
  authAPICtrl.profile,
]);

routeLoader.load(ROUTE.authAPI.modifyProfile, [
  authAPICtrl.modifyProfile,
]);
