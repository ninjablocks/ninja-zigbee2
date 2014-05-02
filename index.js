'use strict';

var util = require('util');
var stream = require('stream');
var glob = require('glob');
var ZigBee = require('zigbee');

var _ = require('underscore');
var OnOffDevice = require('./devices/OnOffDevice');
var MeteringDevice = require('./devices/MeteringDevice');

function ZigBeeDriver(opts, app) {
  this.opts = opts;
  this.app = app;

  this.seenDevices = [];

  app.once('client::up', function() {
    this.log.debug('Starting up');
    this.log.debug('Configuration', this.opts);

    // TODO: Allow path set by configuration/env vars
    this.getDevicePath(function(err, path) {
      if (err) {
        return this.log.warn('Not starting driver -', err.message);
      }
      this.connect(path);
    }.bind(this));

  }.bind(this));

}
util.inherits(ZigBeeDriver, stream);

ZigBeeDriver.prototype.getDevicePath = function(cb) {
  glob('{/dev/tty.zigbee,/dev/cu.usbmodem*}', function (err, devices) {
    // TODO: Support the CC2530 on the Sphere.
    if (err || devices.length != 1) {
      return cb(new Error('Found ' + devices.length + ' devices that could be the CC2530 device.'));
    }

    cb(null, devices[0]);
  });
};


ZigBeeDriver.prototype.connect = function(path) {
  var log = this.log;
  var self = this;

  var client = new ZigBee();
  client.connectToPort(path)
    .then(client.firmwareVersion.bind(client))
    .then(function(version) {

      var versionString = [
        version.specifics.majorRelease,
        version.specifics.minorRelease,
        version.specifics.maintenanceRelease
      ].join('.');

      console.log('CC2530/1 firmware version: %s %s', version.type, versionString);

    })
    /*/ 
    .then(function() {
      console.log('Resetting device');
      client.resetDevice(false);
    })//*/
    .then(client.startCoordinator.bind(client))
    .then(function() {
  
      log.info('Coordinator started.');

      setInterval(function() {
        client.devices().then(function(devices) {
          devices.forEach(function(device) {
            self.handleDevice(device);
          });
        });
      }, 5000);
          
    })
    .done(function() {
      log.info('ZigBee client running.');
    }, function(err) {
      log.error('ZigBee client failed:', err.stack);
    });
};

ZigBeeDriver.prototype.handleDevice = function(device) {
  var log = this.log;

  if (this.seenDevices.indexOf(device.deviceInfo.shortAddr) > -1) {
    return;
  }

  this.seenDevices.push(device.deviceInfo.shortAddr);

  log.info('Got a new device IEEE:%s Addr:0x%s', device.IEEEAddress, device.deviceInfo.shortAddr.toString(16));

  device.on('endpoint', addEndpoint);

  device.findEndpoints(0x0104);
  device.findActiveEndpoints();

  var self = this;

  function addEndpoint(endpoint) {
    log.debug('Got endpoint', endpoint.toString());

    endpoint.inClusters().then(function(inClusters) {

      var basic = _.find(inClusters, function(c) {
        return c.description.name == 'Basic';
      });

      basic.readAttributes('ManufacturerName', 'ModelIdentifier').then(function(vals) {

        console.log('Model vals', vals);
        var deviceName = (vals.ModelIdentifier || '[unknown model]') + (vals.ManufacturerName?' by ' + vals.ManufacturerName:'');

        inClusters.forEach(function(zcl) {

          /*zcl.readAttributes(0,1,2,3,4,5,6,7,8,9).then(function(results) {
            console.log(zcl.toString(), 'attributes 0-9', JSON.stringify(results,2,2));
          });*/

          log.info('Found a cluster', zcl.toString(), 'Attributes:', zcl.attributes, 'Commands:',zcl.commands);

          log.info('Cluster info', vals);

          var ninjaDevice;
          if (zcl.description.name == 'On/Off') {
            log.info('Found an On/Off device');

            ninjaDevice = new OnOffDevice(zcl, log.extend(zcl.toString()));
          } else if (zcl.description.name == 'Simple Metering') {
            log.info('Found an Metering device (power?)');

            ninjaDevice = new MeteringDevice(zcl, log.extend(zcl.toString()));
          }

          if (ninjaDevice) {
            ninjaDevice.name += ' - ' + deviceName;
            ninjaDevice.G = 'zigbee' + device.IEEEAddress.toString() + endpoint.endpointId;

            ninjaDevice.on('ready', function() {
              self.emit('register', ninjaDevice);
            });
          } else {
            log.warn('Cluster was not used to create a Ninja Device');
          }

        });
      });
      
    }).catch(function(err) {
      console.error('Failed getting clusters for device', err.stack);
    });
  }

};


module.exports = ZigBeeDriver;