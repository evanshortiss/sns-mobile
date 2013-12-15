module.exports = Interface;

var SUPPORTED_PLATFORMS = ['android', 'ios'];

var async = require('async'),
  AWS = require('aws-sdk');


/**
 * @constructor
 * Interface to use SNS Push Notifications
 * @param   {Object} opts
 * @return  {Interface}
 */

function Interface(opts) {
  if (!deviceSupported(opts.platform)) {
    throw new Error('Unsupported platform ' + opts.platform + ' was provided for Push Notifications, "' + opts.platform + '"')
  }

  this.platformApplicationArn = opts.platformApplicationArn;
  this.platform = opts.platform;

  this.sns = new AWS.SNS({
    region: opts.region,
    apiVersion: opts.apiVersion,
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opt.secretAccessKey
  });
}

var proto = Interface.proto;


/**
 * Returns the PlatformApplicationArn for this instance.
 * @return {String}
 */
proto.getPlatformApplicationArn = function() {
  return this.platformApplicationArn;
};


/**
 * Returns the region for this instance.
 * @return {String}
 */
proto.getAwsRegion = function() {
  return this.sns.region;
};


/**
 * Returns the AWS api version for this instance.
 * @return {String}
 */
proto.getApiVersion = function() {
  return this.sns.apiVersion;
};


/**
 * Add a user to the service.
 * @param {String}    deviceId
 * @param {String}    platform
 * @param {String}    [customUserData]
 * @param {Function}  callback
 */

proto.addUser = function(deviceId, customUserData callback) {
  if (!callback) {
    callback = customUserData;
  }

  this.sns.createPlatformEndpoint({
    PlatformApplicationArn: env.getgetPlatformArn(platform),
    Token: deviceId,
    Enabled: true,
    CustomUserData: customUserData
  }, function(err, res) {
    return callback(err, res.EndpointArn);
  });
};


/**
 * Get a user by their EndpointArn
 * @param {String}    endpointArn
 * @param {Function}  callback
 */
proto.getUser = function(endpointArn, callback) {
  this.sns.getEndpointAttributes({
    EndpointArn: endpointArn
  }, callback);
};


/**
 * Delete a user from the service.
 * @param {String}    endpointArn
 * @param {Function}  callback
 */

proto.deleteUser = function(endpointArn, callback) {
  this.sns.deleteEndpoint({
    EndpointArn: endpointArn
  }, callback);
};


/**
 * Send a message to an Android device.
 * @param {String}    endpointArn
 * @param {Object}    message
 * @param {Function}  callback
 */

proto.sendMessage = function(endpointArn, message, callback) {
  if (this.platform === 'android') {
    this.sendGcmMessage(endpointArn, message, callback);
  } else if (this.platform === 'ios') {
    this.sendApnsMessage(endpointArn, message, callback);
  } else {
    throw new Error('Unsupoorted platform was provided, "' + this.platform + '"')
  }
};


/**
 * Send a message to GCM
 * @param {String}    message
 * @param {Function}  callback
 */

proto.sendGcmMessage = function(message, callback) {
  message = JSON.stringify({

  });

  sns.publish({
    Message: message,
    TargetArn: this.platformApplicationArn,
    MessageStructure: 'json',
  });
};


/**
 * Send a message to APNS
 * @param {String}    message
 * @param {Function}  callback
 */

proto.sendApnsMessage = function(message, callback) {
  message = JSON.stringify({

  });

  sns.publish({
    Message: message,
    TargetArn: this.platformApplicationArn,
    MessageStructure: 'json',
  });
};


/**
 * Broadcast a message to all endpoints.
 * Message send errors are ignored.
 * @param {String}    message
 * @param {Function}  callback
 */
proto.broadcastMessage = function(message, callback, nextToken) {
  var self = this;

  // List all users 
  this.sns.listEndpointsByPlatformApplication({
    PlatformApplicationArn: self.getArn(),
    NextToken: nextToken,
  }, function(err, res) {
    if (err) {
      return callback(err, null);
    }

    // Are we finished?
    if(res.Endpoints.length <= 0) {
      return callback(null, null);
    }

    async.eachSeries(res['Endpoints'], function(endpoint, cb) {
      self.sendMessage(endpoint.EndpointArn, message, function(err, res) {
        cb();
      });
    }, function() {
      self.broadcastMessage(message, callback, res.NextToken);
    });
  });
};


/**
 * Check is the provided platform supported.
 * @param   {String} platform
 * @return  {Boolean}
 */

function deviceSupported(platform) {
  return (SUPPORTED_PLATFORMS.indexOf(platform) >= 0);
}
