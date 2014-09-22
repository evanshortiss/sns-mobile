#SNS Mobile Push

Module to make interacting with mobile push notifications for iOS and Android easier. Wraps the Amazon aws-sdk node module. The idea is that you can create an object to represent each Platform Application you plan to use and remove the excess features that aren't needed for Android and iOS applications.

## Setting Up a User for SNS
To use Amazon SNS you need a Secret Access Key and an Access Key Id. Getting these will require you to create a user under the IAM section of AWS and attach a User Policy with the following Policy Document:

*Disclaimer: I'm not an AWS ninja, this configuration may be too liberal but it works!*

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AccessToSNS",
      "Effect": "Allow",
      "Action": [
        "sns:*"
      ],
      "Resource": [
        "*"
      ]
    }
  ]
}
```

## Simple Code Example for Android
The below example creates an SNS instance for an Android application identified by a PlatformApplicationArn.

```javascript
var SNS = require('sns-push-mobile'),
    EVENTS = SNS.EVENTS;

var SNS_KEY_ID = process.env['SNS_KEY_ID'],
  SNS_ACCESS_KEY = process.env['SNS_ACCESS_KEY'],
  ANDROID_ARN = process.env['SNS_ANDROID_ARN'];

var androidApp = new SNS({
  platform: SNS.SUPPORTED_PLATFORMS.ANDROID,
  region: 'eu-west-1',
  apiVersion: '2010-03-31',
  accessKeyId: SNS_ACCESS_KEY,
  secretAccessKey: SNS_KEY_ID,
  platformApplicationArn: ANDROID_ARN,
  //sandbox: true (This is required for targetting (iOS) APNS_SANDBOX only)
});

// Add a user, the endpointArn is their unique id
// endpointArn is required to send messages to the device
androidApp.addUser('some_fake_deviceid_that_i_made_up', JSON.stringify({
  some: 'extra data'
}), function(err, endpointArn) {
  if(err) {
    throw err;
  }

  // Send a simple String or data to the client
  androidApp.sendMessage(enpointArn, 'Hi There!', function(err, messageId) {
    if(err) {
      throw err;
    }

    console.log('Message sent, ID was: ' + messageId);
  });
});
```

## Events Emitted
Instances created will emit events as listed below and callbacks should have the shown format. Event strings can be accessed as shown below.

```
var SNS = require('sns-mobile'),
    EVENTS = SNS.EVENTS;

// EVENTS.SENT_MESSAGE
// EVENTS.BROADCAST_END
// EVENTS.BROADCAST_START
// EVENTS.FAILED_SEND
// EVENTS.DELETED_USER
// EVENTS.ADD_USER_FAILED
// EVENTS.ADDED_USER

var myApp = new SNS({
  platform: SNS.SUPPORTED_PLATFORMS.ANDROID,
  region: 'eu-west-1',
  apiVersion: '2010-03-31',
  accessKeyId: SNS_ACCESS_KEY,
  secretAccessKey: SNS_KEY_ID,
  platformApplicationArn: ANDROID_ARN
  // sandbox: true/false (If we're targetting Apple dev/live APNS)
});

myApp.on(EVENTS.USER_ADDED, function(endpointArn, deviceId){
    // Save user details to a db
});
```

#### broadcastStart
```
function () {}
```
Emitted prior to broadcasting the first message.

#### broadcastEnd
```
function () {}
```
Emitted once all messages are broadcast.

#### messageSent
```
function (endpointArn, res.MessageId) {}
```
Emitted when a message sends successfully.

#### userDeleted
```
function (endpointArn) {}
```
When a user is deleted this is emitted.

#### sendFailed
```
function (endpointArn, err) {}
```
If a message fails to send this is emitted.

#### addUserFailed
```
function(deviceToken, err)
```
Fired when adding a user fails.

#### userAdded
```
function (endpointArn, deviceId) {}
```
When a user is added this is emitted.


## API

#### SNS(opts)
Expects an object with the following params:
* platform: Supply any of the platforms in SNS.SUPPORTED_PLATFORMS
* region: The Amazon region e.g 'eu-west-1'
* apiVersion: Amazon API version, I have only used '2010-03-31'
* accessKeyId: Amazon user Access Key.
* secretAccessKey: Amazon user Secret Access Key.
* platformApplicationArn: The PlatformApplicationArn for the Platform Application the interface operates on.
* sandbox: Set this to true to target the Apple APNS_SANDBOX environment with messages.

#### SUPPORTED_PLATFORMS
An object containing supported platforms. Available options are:

* SUPPORTED_PLATFORMS.ANDROID
* SUPPORTED_PLATFORMS.IOS
* SUPPORTED_PLATFORMS.KINDLE_FIRE

#### getPlatformApplicationArn()
Returns the platformApplicationArn provided to the constructor.

#### getRegion()
Returns the region being used.

#### getApiVersion()
Returns apiVersion being used.

#### getApplications(callback)
Get all Platform Applications. This will not allow you to interface with other PlatformApplications but may be useful to just get a list of you applications. Callback format callback(err, users)

#### getUser(endpointArn, callback)
Get a user via endpointArn. The callback(err, user) receives an Object containg Attributes for the user and the EndpointArn.

#### getUsers(callback)
Get all users, this could take a while due to a potentially high number of requests required to get each page of users. The callback(err, users) receives an Array containing users.

#### addUser(deviceToken, [data], callback)
Add a device/user to SNS with optional extra data. Callback has format fn(err, endpointArn).

#### deleteUser(endpointArn, callback)
Delete a user from SNS. Callback has format callback(err)

#### sendMessage(endpointArn, message, callback)
Send a message to a user. The _message_ parameter can be a String, or an Object with the formats below. The callback format is callback(err, messageId).

You can read about Amazon SNS message formats [here](http://docs.aws.amazon.com/sns/latest/dg/mobile-push-send-custommessage.html).

iOS:

```
{
  aps: {
    alert: message
  }
}
```

Read more about APNS payload [here](https://developer.apple.com/library/ios/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/Chapters/ApplePushService.html).

Android & Kindle Fire:

```
{
  data: {
    message: message
  }
}
```

Read more about GCM [here](http://developer.android.com/google/gcm/c2dm.html) and ADM [here](http://docs.aws.amazon.com/sns/latest/dg/mobile-push-adm.html).

#### broadcastMessage(message, callback)
Send message to all users. May take some time with large sets of users as it has to page through users. Callback format is callback(err). If a single/mulitple messages fail to send the error will not be propogated/returned to the callback. To catch these errors use the _sendFailed_ event.
