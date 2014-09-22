console.warn('Ensure that SNS_ACCESS_KEY, SNS_KEY_ID and SNS_ANDROID_ARN env vars are set for these tests!\n');

var assert = require('assert'),
  SNS = require('../lib/Interface');

var SNS_KEY_ID = process.env['SNS_KEY_ID'],
  SNS_ACCESS_KEY = process.env['SNS_ACCESS_KEY'],
  ANDROID_ARN = process.env['SNS_ANDROID_ARN'],
  iOS_ARN = process.env['SNS_iOS_ARN'];

console.log('Running tests with settings...\n');
console.log('SNS_KEY_ID: %s\nSNS_ACCESS_KEY: %s\nSNS_ANDROID_ARN: %s\nSNS_iOS_ARN: %s\n', SNS_KEY_ID, SNS_ACCESS_KEY, ANDROID_ARN, iOS_ARN);

var sns = null;

describe('SNS Module.', function() {
  this.timeout(10000);

  it('Should have events and supported platforms exposed on the interface', function() {
    assert(SNS.SUPPORTED_PLATFORMS);
    assert(SNS.EVENTS);
  });

  it('Should create an instance of Interface', function() {
    sns = new SNS({
      platform: 'android',
      region: 'eu-west-1',
      apiVersion: '2010-03-31',
      accessKeyId: SNS_ACCESS_KEY,
      secretAccessKey: SNS_KEY_ID,
      platformApplicationArn: ANDROID_ARN
    });

    assert(sns);
  });

  it('Should return correct apiVersion, region, PlatformApplicationArn', function() {
    sns = new SNS({
      platform: 'android',
      region: 'eu-west-1',
      apiVersion: '2010-03-31',
      accessKeyId: SNS_ACCESS_KEY,
      secretAccessKey: SNS_KEY_ID,
      platformApplicationArn: ANDROID_ARN
    });

    assert(sns);
    assert(sns.getApiVersion() === '2010-03-31');
    assert(sns.getRegion() === 'eu-west-1');
    assert(sns.getPlatformApplicationArn() === ANDROID_ARN);
  });

  // Replace SNS instance for each test
  beforeEach(function() {
    sns = new SNS({
      platform: 'android',
      region: 'eu-west-1',
      apiVersion: '2010-03-31',
      accessKeyId: SNS_ACCESS_KEY,
      secretAccessKey: SNS_KEY_ID,
      platformApplicationArn: ANDROID_ARN
    });
  });

  it('Should return PlatformApplications list', function(done) {
    sns.getApplications(function(err, apps) {
      assert(!err);
      assert(apps);
      assert(apps.length >= 0);
      done();
    });
  });

  it('Should return Endpoints list for given PlatformApplication', function(done) {
    sns.getUsers(function(err, users) {
      assert(!err);
      assert(users);
      assert(users.length >= 0);
      done();
    });
  });

  it('Should add an Android user.', function(done) {
    sns.addUser('somefakedeviceidthatimadeup', JSON.stringify({
      username: 'fakeuser'
    }), function(err, endpointArn) {
      assert(!err);
      assert(endpointArn);
      done();
    });
  });

  it('Should retrieve a user by their EndpointArn and delete them', function(done) {
    sns.addUser('somefakedeviceidthatimadeup', JSON.stringify({
      username: 'fakeuser'
    }), function(err, endpointArn) {
      sns.getUser(endpointArn, function(err, res) {
        assert(!err);
        assert(res.EndpointArn === endpointArn);
        done();

        sns.deleteUser(res.EndpointArn, function(err) {
          assert(!err);
          assert(res.ResponseMetadata);
        });
      });
    });
  });

  it('Should get all users on this PlatformApplication', function(done) {
    sns.getUsers(function(err, users) {
      assert(!err);
      assert(users);
      assert(users.length >= 0);
      done();
    });
  });

  it('Should send a message to all users on PlatformApplication, will add one first to ensure user exists.', function(done) {
    sns.addUser('somefakedeviceidthatimadeupagain', JSON.stringify({
      username: 'fakeuser2'
    }), function(err, endpointArn) {
      assert(!err);
      assert(endpointArn);

      sns.broadcastMessage('Hello to ALL the devices!', function(err, users) {
        assert(!err);
        done();
      });
    });
  });

  it('Should create a user and send a message to that Android user.', function(done) {
    sns.addUser('somefakedeviceidthatimadeup', JSON.stringify({
      username: 'fakeuser'
    }), function(err, endpointArn) {
      sns.sendMessage(endpointArn, {
        data: 'Hello World',
        moreData: 'Hello Universe'
      }, function(err, res) {
        assert(!err);
        assert(res);
        assert(typeof res === 'string');
        done();
      })
    });
  });
});
