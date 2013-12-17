module.exports = Interface;

var SUPPORTED_PLATFORMS = ['android', 'ios'];

var async = require('async'),
  util = require('util'),
  events = require('events'),
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
util.inherits(Interface, events.EventEmitter);

var proto = Interface.prototype;


/**
 * Get all applications for this account.
 * @param {Function} calback
 */
proto.getApplications = function(callback) {
  var applications = [];

  getApplications(null, function(err, res) {
    var nextToken = res.NextToken;
    applications.push(res.PlatformApplications);

    async.whilst(function() {
      // Only keep going so long as we have a token
      return (typeof nextToken !== 'undefined' && nextToken !== null);
    }, function(cb) {
      getApplications(nextToken, function(err, res) {
        if (err) {
          return cb(err);
        }

        nextToken = res.NextToken;
        applications.push(res.PlatformApplications);
        cb();
      });
    }, function(err) {
      return callback(err, applications);
    })
  });
};


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

  var self = this;
  this.sns.createPlatformEndpoint({
    PlatformApplicationArn: env.getgetPlatformArn(platform),
    Token: deviceId,
    Enabled: true,
    CustomUserData: customUserData
  }, function(err, res) {
    if(!err) {
      self.emit('userAdded', res.EndpointArn);
    }
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
 * Return a list of users.
 * @param {Function}  callback
 * @param {String}    nextToken
 */
proto.getUsers = function(callback, nextToken) {
  this.sns.listEndpointsByPlatformApplication({
    PlatformApplicationArn: self.getArn(),
    NextToken: nextToken,
  }, function(err, res) {
    if (err) {
      return callback(err, null, null);
    }

    return callback(err, res, nextToken)
  });
};


/**
 * Delete a user from the service.
 * @param {String}    endpointArn
 * @param {Function}  callback
 */

proto.deleteUser = function(endpointArn, callback) {
  var self = this;

  this.sns.deleteEndpoint({
    EndpointArn: endpointArn
  }, function(err, res) {
    if(!err) {
      self.emit('userDeleted', res);
    }
    return callback(err, res);
  });
};


/**
 * Send a message to an Android or iOS device.
 * Message is JSON object.
 * @param {String}    endpointArn
 * @param {Object}    message
 * @param {Function}  callback
 */

proto.sendMessage = function(endpointArn, message, callback) {
  if (this.platform === 'android') {
    message = convertToGcmFormat(message);
  } else if (this.platform === 'ios') {
    message = convertToApnsFormat(message);
  } else {
    throw new Error('Unsupoorted platform was provided, "' + this.platform + '"')
  }

  var self = this;

  this.sns.publish({
    Message: message,
    TargetArn: endpointArn,
    MessageStructure: 'json',
  }, function(err, res) {
    if(err) {
      self.emit('sendFailed', err);
    } else {
      self.emit('sendSuccess', res.MessageId);
    }

    return callback(err, ((res && res.MessageId) ? res.MessageId : null));
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

  this.getUsers(function(err, res, nextToken) {
    if(err) {
      return callback(err, null);
    }

    if(res.Endpoints.length <= 0) {
      self.emit('broadcastComplete', message);
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

/**
 * Convert a provided message to GCM format
 * @param   {String} message
 * @return  {String}
 */

function convertToGcmFormat = function(message) {
  return JSON.stringify({

  });
}


/**
 * Convert a message to APNS format
 * @param   {String} message
 * @return  {String}
 */

function convertToApnsFormat(message) {
  return JSON.stringify({

  });
}


/**
 * Get applications with the given NextToken (for paging).
 * @param {String}    nextToken
 * @param {Function}  callback
 */
function getApplications(nextToken, callback) {
  var params = {};

  if (nextToken) {
    params.NextToken = nextToken;
  }

  this.sns.listPlatformApplications(params, callback);
}
