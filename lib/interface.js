module.exports = Interface;

var SUPPORTED_PLATFORMS = {
  android: 'android',
  ios: 'ios'
};

var EMITTED_EVENTS = {
  BROADCAST_START: 'broadcastStart',
  BROADCAST_END: 'broadcastEnd',
  SENT_MESSAGE: 'messageSent',
  DELETED_USER: 'userDeleted',
  FAILED_SEND: 'sendFailed',
  ADDED_USER: 'userAdded',
  ADD_USER_FAILED: 'addUserFailed'
};

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
  this.sandbox = opts.sandbox;

  this.sns = new AWS.SNS({
    region: opts.region,
    apiVersion: opts.apiVersion,
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey
  });

  events.EventEmitter.call(this);
}
util.inherits(Interface, events.EventEmitter);


Interface.EVENTS = EMITTED_EVENTS;
Interface.SUPPORTED_PLATFORMS = SUPPORTED_PLATFORMS;


/**
 * Returns the PlatformApplicationArn for this instance.
 * @return {String}
 */

Interface.prototype.getPlatformApplicationArn = function() {
  return this.platformApplicationArn;
};


/**
 * Returns the region for this instance.
 * @return {String}
 */

Interface.prototype.getRegion = function() {
  return this.sns.config.region;
};


/**
 * Returns the AWS api version for this instance.
 * @return {String}
 */

Interface.prototype.getApiVersion = function() {
  return this.sns.config.apiVersion;
};


/**
 * Add a user to the service.
 * @param {String}    deviceId
 * @param {String}    platform
 * @param {String}    [customUserData]
 * @param {Function}  callback
 */

Interface.prototype.addUser = function(deviceId, customUserData, callback) {
  if (!callback) {
    callback = customUserData;
  }

  var params = {
    PlatformApplicationArn: this.getPlatformApplicationArn(),
    Token: deviceId,
  };

  if(customUserData) {
    params.CustomUserData = customUserData;
  }

  var self = this;
  this.sns.createPlatformEndpoint(params, function(err, res) {
    if (!err) {
      self.emit(EMITTED_EVENTS.ADDED_USER, res.EndpointArn, deviceId);
    } else {
        self.emit(EMITTED_EVENTS.ADD_USER_FAILED, deviceId, err);
    }
    return callback(err, ((res && res.EndpointArn) ? res.EndpointArn : null));
  });
};


/**
 * Get a user by their EndpointArn
 * @param {String}    endpointArn
 * @param {Function}  callback
 */

Interface.prototype.getUser = function(endpointArn, callback) {
  this.sns.getEndpointAttributes({
    EndpointArn: endpointArn
  }, function(err, res) {
    if (err) {
      return callback(err, null);
    }

    res.EndpointArn = endpointArn;
    return callback(null, res);
  });
};


/**
 * Return a list of users.
 * @param {Function}  callback
 * @param {String}    nextToken
 */

Interface.prototype.getUsers = function(callback) {
  var users = [];

  var self = this;
  this._getUsers(null, function(err, res) {
    if (err) {
      return callback(err, null);
    }
    var nextToken = res.NextToken;
    users = users.concat(res.Endpoints);

    async.whilst(function() {
      // Only keep going so long as we have a token
      return (typeof nextToken !== 'undefined' && nextToken !== null);
    }, function(cb) {
      self._getUsers(nextToken, function(err, res) {
        if (err) {
          return cb(err);
        }

        nextToken = res.NextToken;
        users = users.concat(res.Endpoints);
        cb();
      });
    }, function(err) {
      return callback(err, users);
    })
  });
};


/**
 * Return a list of users.
 * @param {Function}  callback
 * @param {String}    nextToken
 */

Interface.prototype._getUsers = function(nextToken, callback) {
  var params = {
    PlatformApplicationArn: this.getPlatformApplicationArn()
  };

  if (nextToken) {
    params.NextToken = nextToken;
  }

  this.sns.listEndpointsByPlatformApplication(params, callback);
};


/**
 * Get applications with the given NextToken (for paging).
 * @param {String}    nextToken
 * @param {Function}  callback
 */

Interface.prototype._getApplications = function(nextToken, callback) {
  var params = {};

  if (nextToken) {
    params.NextToken = nextToken;
  }

  this.sns.listPlatformApplications(params, callback);
};


/**
 * Get all users for this account.
 * @param {Function} calback
 */

Interface.prototype.getApplications = function(callback) {
  var applications = [];

  var self = this;
  this._getApplications(null, function(err, res) {
    if (err) {
      return callback(err, null);
    }
    var nextToken = res.NextToken;
    applications = applications.concat(res.PlatformApplications);

    async.whilst(function() {
      // Only keep going so long as we have a token
      return (typeof nextToken !== 'undefined' && nextToken !== null);
    }, function(cb) {
      self._getApplications(nextToken, function(err, res) {
        if (err) {
          return cb(err);
        }

        nextToken = res.NextToken;
        applications = applications.concat(res.PlatformApplications);
        cb();
      });
    }, function(err) {
      return callback(err, applications);
    })
  });
};


/**
 * Get applications with the given NextToken (for paging).
 * @param {String}    nextToken
 * @param {Function}  callback
 */

Interface.prototype._getApplications = function(nextToken, callback) {
  var params = {};

  if (nextToken) {
    params.NextToken = nextToken;
  }

  this.sns.listPlatformApplications(params, callback);
};



/**
 * Delete a user from the service.
 * @param {String}    endpointArn
 * @param {Function}  callback
 */

Interface.prototype.deleteUser = function(endpointArn, callback) {
  var self = this;

  this.sns.deleteEndpoint({
    EndpointArn: endpointArn
  }, function(err, res) {
    if (!err) {
      self.emit(EMITTED_EVENTS.DELETED_USER, endpointArn);
    }
    return callback(err);
  });
};


/**
 * Send a message to an Android or iOS device.
 * Message is JSON object.
 * @param {String}    endpointArn
 * @param {Object}    message
 * @param {Function}  callback
 */

Interface.prototype.sendMessage = function(endpointArn, message, callback) {
  if (this.platform === 'android') {
    message = convertToGcmFormat(message);
  } else if (this.platform === 'ios') {
    message = convertToApnsFormat(message, this.sandbox);
  } else {
    throw new Error('Unsupported platform was provided to constructor module opts, "' + this.platform + '"')
  }

  var self = this;

  this.sns.publish({
    Message: JSON.stringify(message),
    TargetArn: endpointArn,
    MessageStructure: 'json',
  }, function(err, res) {
    if (err) {
      self.emit(EMITTED_EVENTS.FAILED_SEND, endpointArn, err);
    } else {
      self.emit(EMITTED_EVENTS.SENT_MESSAGE, endpointArn, res.MessageId);
    }

    return callback(err, ((res && res.MessageId) ? res.MessageId : null));
  });
};


Interface.prototype._broadcastMessage = function(endpoints, message, callback) {
  var self = this;

  async.each(endpoints, function(endpoint, cb) {
    self.sendMessage(endpoint.EndpointArn, message, function(err, res) {
      cb();
    });
  }, function(err) {
    // We don't care if a send fail, event can be used to catch it
    callback();
  });
}


/**
 * Broadcast a message to all endpoints.
 * Message send errors are ignored.
 * @param {String}    message
 * @param {Function}  callback
 */
Interface.prototype.broadcastMessage = function(message, callback) {
  var self = this;
  this._getUsers(null, function(err, res) {
    if (err) {
      return callback(err, null);
    }
    var nextToken = res.NextToken;

    self.emit(EMITTED_EVENTS.BROADCAST_START);

    self._broadcastMessage(res.Endpoints, message, function() {
      async.whilst(function() {
        // Only keep going so long as we have a token
        return (typeof nextToken !== 'undefined' && nextToken !== null);
      }, function(cb) {
        self._getUsers(nextToken, function(err, res) {
          if (err) {
            return cb(err);
          }

          nextToken = res.NextToken;
          self._broadcastMessage(res.Endpoints, message, cb);
        });
      }, function(err) {
        self.emit(EMITTED_EVENTS.BROADCAST_END);
        return callback(err);
      });
    });
  });
};


/**
 * Check is the provided platform supported.
 * @param   {String} platform
 * @return  {Boolean}
 */

function deviceSupported(platform) {
  return SUPPORTED_PLATFORMS.hasOwnProperty(platform.toLowerCase());
}

Interface.deviceSupported = deviceSupported;


/**
 * Convert a provided message to GCM format
 * @param   {String/Object} message
 * @return  {String}
 */

function convertToGcmFormat(message) {
  // GCM format expected by amazon for messages
  // {
  //   GCM: JSON.stringify({
  //     data: {
  //       message:"<message>"
  //     }
  //   })
  // }
  if (typeof message === 'string') {
    return {
      GCM: JSON.stringify({
        data: {
          message: message
        }
      })
    };
  } else if (message != null && typeof message === 'object') {
    return {
      GCM: JSON.stringify(message)
    };
  } else {
    throw new Error('Unable to convert message to GCM format. Message must be String/Object.');
  }
}


/**
 * Convert a message to APNS format
 * @param   {String/Object} message
 * @return  {String}
 */

function convertToApnsFormat(message, sandbox) {
  // APNS format expected by amazon for messages
  // {
  //   APNS: JSON.stringify({
  //     "aps": {
  //       "alert": "<message>"
  //     }
  //   })
  // }
  var APNS = sandbox ? 'APNS_SANDBOX' : 'APNS';
  var messageContainer = {};
  if (typeof message === 'string') {
    messageContainer[APNS] = JSON.stringify({
      aps: {
        alert: message
      }
    });
    return messageContainer;
  } else if (message !== null && typeof message === 'object') {
    messageContainer[APNS] = JSON.stringify(message);
    return messageContainer;
  } else {
    throw new Error('Unable to convert message to APNS format. Message must be String/Object.');
  }
}
