'use strict';

var util = require('util');
var stream = require('stream');

var glob = require('glob');

var zigbee = require('zigbee');

var _ = require('underscore');

var OnOffDevice = require('./devices/OnOffDevice');

function ZigBeeDriver(opts, app) {
  this.opts = opts;
  this.app = app;

  this.bridges = {};

  app.once('client::up', function() {
    this.log.debug('Starting up');
    this.log.debug('Configuration', this.opts);

    // TODO: Allow path set by configuration/env vars
    this.getDevicePath(function(err, path) {
      if (err) {
        return this.log.error(err);
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
      cb(new Error('Found ' + devices.length + ' devices that could be the CC2531 usb dongle.'));
    }

    cb(null, devices[0]);
  });
};


ZigBeeDriver.prototype.connect = function(path) {
  var log = this.log;
  var self = this;
   zigbee
      .connectNetworkProcessor(path)
      
      .then(function(client) {
        self.client = client;
        log.info('ZigBee device ready, setting up as coordinator');

        return client.firmwareVersion().then(function(version) {
            log.info('CC2530/1 firmware version: %s %d.%d.%d', version.type,
            version.specifics.majorRelease, version.specifics.minorRelease,
            version.specifics.maintenanceRelease);
          })
          
          /*/ reset our device so we get back to a clean state
          .then(function() {
            client.resetDevice(false);
          })//*/
          .delay(2000)

          .then(client.startCoordinator())

          .delay(2000)
          // now find existing devices and print them out
          .then(function() {

            log.info('Coordinator started. Searching for devices');
            client.devices().then(function(devices) {
              devices.forEach(function(device) {
                self.handleDevice(device);
              });
            });
          });
      })
      .done(function() {
        log.info('ZigBee client running.');
      }, function(err) {
        log.error('ZigBee client failed:', err.stack);
      });
};

ZigBeeDriver.prototype.handleDevice = function(device) {
  var log = this.log;

  log.info('Got a new device IEEE:%s Addr:0x%s', device.IEEEAddress, device.deviceInfo.shortAddr.toString(16));

  device.findEndpoints(0x0104);
  device.findActiveEndpoints();

  var self = this;

  // HACK: Wait 5 seconds then use whatever endpoints we've found
  setTimeout(function() {
    for (var id in device._endpoints) {
      addEndpoint(device._endpoints[id]);
    }
  }, 5000);

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
            ninjaDevice.G = 'zigbee' + device.IEEEAddress.toString() + endpoint.endpointId;

            ninjaDevice.name += ' - ' + deviceName;
          }

          if (ninjaDevice) {
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

