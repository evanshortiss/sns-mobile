'use strict';

module.exports = Interface;

var SUPPORTED_PLATFORMS = {
  ANDROID: 'ANDROID',
  IOS: 'IOS',
  KINDLE_FIRE: 'KINDLE_FIRE',
  // For bc with older versions
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
  ADD_USER_FAILED: 'addUserFailed',
  ATTRIBUTES_UPDATED: 'attributesUpdated',
  ATTRIBUTES_UPDATE_FAILED: 'attributesUpdateFailed',
  TOPIC_CREATED: 'topicCreated',
  CREATE_TOPIC_FAILED: 'createTopicFailed',
  TOPIC_DELETED: 'topicDeleted',
  DELETE_TOPIC_FAILED: 'deleteTopicFailed',
  SUBSCRIBED: 'subscribed',
  SUBSCRIBE_FAILED: 'subscribeFailed',
  UNSUBSCRIBED: 'unsubscribed',
  UNSUBSCRIBE_FAILED: 'unsubscribeFailed',
  PUBLISH_FAILED: 'publishFailed',
  PUBLISHED_MESSAGE: 'publishedMessage'
};

var async = require('async')
  , util = require('util')
  , events = require('events')
  , AWS = require('aws-sdk');

/**
 * @constructor
 * Interface to use SNS Push Notifications
 * @param   {Object} opts
 * @return  {Interface}
 */

function Interface(opts) {
  if (!deviceSupported(opts.platform)) {
    var e = util.format('Unsupported platform option, "%s". Please provide ' +
      'a platform from SNS.SUPPORTED_PLATFORMS', opts.platform);

    throw new Error(e);
  }

  this.platformApplicationArn = opts.platformApplicationArn;
  this.platform = opts.platform;
  this.sandbox = opts.sandbox;

  if (opts.sns) {
    if (
      opts.sns instanceof AWS.SNS ||
      (opts.sns.createPlatformEndpoint && opts.sns.getEndpointAttributes)
    ){
      this.sns = opts.sns;
    } else {
      this.sns = new AWS.SNS(opts.sns);
    }
  } else {
    this.sns = new AWS.SNS({
      region: opts.region,
      apiVersion: opts.apiVersion,
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey
    });
  }

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
 * Set a user's attributes by their EndpointArn
 * @param {String}    endpointArn
 * @param {Object}    attributes  An object that can contain string properties
 *                                for CustomUserData, Enabled and Token
 * @param {Function}  callback
 */

Interface.prototype.setAttributes =
  function (endpointArn, attributes, callback) {
    var self = this;
    var attributesType = typeof(attributes);
    if (attributesType == 'object') {
      try {
        if (typeof attributes.CustomUserData == 'object') {
          attributes.CustomUserData = JSON.stringify(attributes.CustomUserData);
        }
      } catch (e) {
        return callback(e, null);
      }
    } else {
      return callback(
        new Error('Expected second parameter to be of type object (' +
          attributesType + ' supplied).'), null);
    }
    var params = {
      EndpointArn: endpointArn,
      Attributes: attributes
    };
    this.sns.setEndpointAttributes(params, function(err) {
      if (!err) {
        self.emit(EMITTED_EVENTS.ATTRIBUTES_UPDATED, endpointArn, attributes);
      } else {
        self.emit(EMITTED_EVENTS.ATTRIBUTES_UPDATE_FAILED, endpointArn, err);
      }
      return callback(err, attributes);
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
    });
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
    });
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
  }, function(err) {
    if (!err) {
      self.emit(EMITTED_EVENTS.DELETED_USER, endpointArn);
    }
    return callback(err);
  });
};


/**
 * Create a topic.
 * @param {String}    name
 * @param {Function}  callback
 */

Interface.prototype.createTopic = function(name, callback) {
  var params = {
    Name: name
  };
  var self = this;
  self.sns.createTopic(params, function(err, res) {
    if (err) {
      self.emit(EMITTED_EVENTS.CREATE_TOPIC_FAILED, name, err);
      return callback(err);
    }
    if (!res || !res.TopicArn) {
      return callback(new Error('Response or TopicArn is null'));
    }
    self.emit(EMITTED_EVENTS.TOPIC_CREATED, res.TopicArn, name);
    callback(null, res.TopicArn);
  });
};


/**
 * Delete a topic.
 * @param {String}    topicArn
 * @param {Function}  callback
 */

Interface.prototype.deleteTopic = function(topicArn, callback) {
  var params = {
    TopicArn: topicArn
  };
  var self = this;
  self.sns.deleteTopic(params, function(err) {
    if (err) {
      self.emit(EMITTED_EVENTS.DELETE_TOPIC_FAILED, topicArn, err);
      return callback(err);
    }
    self.emit(EMITTED_EVENTS.TOPIC_DELETED, topicArn);
    callback();
  });
};


/**
 * Get all topics for this account.
 * @param {Function} callback
 */

Interface.prototype.getTopics = function(callback) {
  var topics = [];
  var self = this;
  var nextToken;
  async.doWhilst(function(next) {
    self._getTopics(nextToken, function(err, res) {
      if (err) {
        return next(err);
      }
      nextToken = res.NextToken;
      if (res.Topics && res.Topics.length) {
        topics = topics.concat(res.Topics);
      }
      next();
    });
  }, function() {
    return !!nextToken;
  }, function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, topics);
  });
};


/**
 * Get topics with the given NextToken (for paging).
 * @param {String}    nextToken
 * @param {Function}  callback
 */

Interface.prototype._getTopics = function(nextToken, callback) {
  var params = {};
  if (nextToken) {
    params.NextToken = nextToken;
  }
  this.sns.listTopics(params, callback);
};


/**
 * Get subscriptions; either all subscriptions for this account or those for
 * the topic ARN specified.
 * @param {String}    topicArn
 * @param {Function}  callback
 */

Interface.prototype.getSubscriptions = function(topicArn, callback) {
  if (typeof topicArn === 'function') {
    callback = topicArn;
    topicArn = undefined;
  }
  var subscriptions = [];
  var self = this;
  var nextToken;
  async.doWhilst(function(next) {
    self._getSubscriptions(nextToken, topicArn, function(err, res) {
      if (err) {
        return next(err);
      }
      nextToken = res.NextToken;
      if (res.Subscriptions && res.Subscriptions.length) {
        subscriptions = subscriptions.concat(res.Subscriptions);
      }
      next();
    });
  }, function() {
    return !!nextToken;
  }, function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, subscriptions);
  });
};


/**
 * Get subscriptions with the given NextToken (for paging).
 * @param {String}    nextToken
 * @param {String}    topicArn
 * @param {Function}  callback
 */

Interface.prototype._getSubscriptions =
  function (nextToken, topicArn, callback) {
    var params = {};
    if (nextToken) {
      params.NextToken = nextToken;
    }
    if (!topicArn) {
      this.sns.listSubscriptions(params, callback);
      return;
    }
    params.TopicArn = topicArn;
    this.sns.listSubscriptionsByTopic(params, callback);
  };


/**
 * Subscribe an endpoint to a topic.
 * @param {String}    endpointArn
 * @param {String}    topicArn
 * @param {Function}  callback
 */

Interface.prototype.subscribe = function(endpointArn, topicArn, callback) {
  var params = {
    Endpoint: endpointArn,
    TopicArn: topicArn,
    Protocol: 'application'
  };
  var self = this;
  self.sns.subscribe(params, function(err, res) {
    if (err) {
      self.emit(EMITTED_EVENTS.SUBSCRIBE_FAILED, endpointArn, topicArn, err);
      return callback(err);
    }
    if (!res || !res.SubscriptionArn) {
      return callback(new Error('Response or SubscriptionArn is null'));
    }
    self.emit(
      EMITTED_EVENTS.SUBSCRIBED,
      res.SubscriptionArn,
      endpointArn,
      topicArn
    );
    callback(null, res.SubscriptionArn);
  });
};


/**
 * Unsubscribe an endpoint from a topic via its SubscriptionArn.
 * @param {String}    subscriptionArn
 * @param {Function}  callback
 */

Interface.prototype.unsubscribe = function(subscriptionArn, callback) {
  var params = {
    SubscriptionArn: subscriptionArn
  };
  var self = this;
  self.sns.unsubscribe(params, function(err) {
    if (err) {
      self.emit(EMITTED_EVENTS.UNSUBSCRIBE_FAILED, subscriptionArn, err);
      return callback(err);
    }
    self.emit(EMITTED_EVENTS.UNSUBSCRIBED, subscriptionArn);
    callback();
  });
};


/**
 * Publish a message to a topic identified by its topic ARN.
 * Message is JSON object.
 * @param {String}    topicArn
 * @param {Object}    message
 * @param {Function}  callback
 */

Interface.prototype.publishToTopic = function(topicArn, message, callback) {
  if (!validateMessageStructure(message)) {
    return callback(
      new Error(
        'Argument "message" must be in SNS multi-platform publishing format.'
      )
    );
  }

  var self = this;
  self.sns.publish({
    Message: JSON.stringify(message),
    TopicArn: topicArn,
    MessageStructure: 'json',
  }, function(err, res) {
    if (err) {
      self.emit(EMITTED_EVENTS.PUBLISH_FAILED, topicArn, err);
      return callback(err);
    }
    if (!res || !res.MessageId) {
      return callback(new Error('Response or MessageId is null'));
    }
    self.emit(EMITTED_EVENTS.PUBLISHED_MESSAGE, topicArn, res.MessageId);
    callback(null, res.MessageId);
  });

  function validateMessageStructure(message) {
    if (!message.default) {
      return false;
    }
    if (typeof message.default !== 'string') {
      return false;
    }
    return true;
  }
};


/**
 * Send a message to an Android or iOS device identified by its Endpoint ARN.
 * Message is JSON object.
 * @param {String}    endpointArn
 * @param {Object}    message
 * @param {Function}  callback
 */

Interface.prototype.sendMessage = function(endpointArn, msg, callback) {
  var self = this
    , convertFn = null;

  if (this.platform === SUPPORTED_PLATFORMS.ANDROID ||
      this.platform === SUPPORTED_PLATFORMS.KINDLE_FIRE) {
    convertFn = this.convertToGcmFormat;
  } else if (this.platform === SUPPORTED_PLATFORMS.IOS) {
    convertFn = this.convertToApnsFormat;
  } else {
    var e = util.format('Unsupported platform detected, "%s". Please use a ' +
      'platform on SNS.SUPPORTED_PLATFORMS', this.platform);

    throw new Error(e);
  }

  convertFn.call(this, msg, function (err, message) {
    try {
      self.sns.publish({
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
    } catch (e) {
      return callback(e, null);
    }
  });
};


Interface.prototype._broadcastMessage = function(endpoints, message, callback) {
  var self = this;

  async.each(endpoints, function(endpoint, cb) {
    self.sendMessage(endpoint.EndpointArn, message, function() {
      cb();
    });
  }, callback);
};


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
  return SUPPORTED_PLATFORMS.hasOwnProperty(platform);
}

Interface.deviceSupported = deviceSupported;


/**
 * Convert a provided message to GCM format
 * @param   {String/Object} message
 * @return  {String}
 */

Interface.prototype.convertToGcmFormat = function(message, callback) {
  // GCM format expected by amazon for messages
  // {
  //   GCM: JSON.stringify({
  //     data: {
  //       message:"<message>"
  //     }
  //   })
  // }

  var container = {}
    , key = (this.platform === SUPPORTED_PLATFORMS.ANDROID) ? 'GCM' : 'ADM';

  if (typeof message === 'string') {
    try {
      container[key] = JSON.stringify({
        data: {
          message: message
        }
      });

      callback(null, container);
    } catch (e) {
      callback(e, null);
    }
  } else if (message && typeof message === 'object') {
    if (message.GCM || message.ADM || message.default) {
      callback(null, message);
    } else {
      try {
        container[key] = JSON.stringify(message);

        callback(null, container);
      } catch (e) {
        callback(e, null);
      }
    }
  } else {
    var e = new Error('Unable to convert message to ADM/GCM format. Message ' +
      'must be String/Object.');

    callback(e, null);
  }
};


/**
 * Convert a message to APNS format
 * @param   {String/Object} message
 * @return  {String}
 */

Interface.prototype.convertToApnsFormat = function (message, callback) {
  // APNS format expected by amazon for messages
  // {
  //   APNS: JSON.stringify({
  //     "aps": {
  //       "alert": "<message>"
  //     }
  //   })
  // }

  var APNS = this.sandbox ? 'APNS_SANDBOX' : 'APNS'
    , messageContainer = {};

  if (typeof message === 'string') {
    try {
      messageContainer[APNS] = JSON.stringify({
        aps: {
          alert: message
        }
      });

      callback(null, messageContainer);
    } catch (e) {
      callback(e, null);
    }
  } else if (message !== null && typeof message === 'object') {
    if (message['APNS_SANDBOX'] || message['APNS']) {
      callback(null, message);
    } else {
      try {
        messageContainer[APNS] = JSON.stringify(message);
        callback(null, messageContainer);
      } catch (e) {
        callback(e, null);
      }
    }
  } else {
    var e = new Error('Unable to convert message to APNS format. Message' +
      ' must be String/Object.');

    callback(e, null);
  }
};
