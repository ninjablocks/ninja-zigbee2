'use strict';
var EventEmitter = require('events').EventEmitter;

var opts;
try {
  opts = require('./config.json');
} catch(e) {
  opts = require('./package.json').config || {};
}


function getLog(name) {
  return {
    debug: console.log.bind(name),
    info: console.log.bind(name),
    warn: console.log.bind(name),
    error: console.log.bind(name),
    extend: function(newName) {
      return getLog(name + ' - ' + newName);
    }
  };
}
var app = new EventEmitter();
app.log = getLog(require('./package.json').name);

var driver = new (require('./index'))(opts, app);
driver.log = app.log;

driver.on('register', function(device) {
    console.log('Driver.register', device);
    device.on('data', function(value) {
        console.log('Device.emit data', value);
    });
   if (device.D == 1008) { //It's a light
      setInterval(function() {
         device.write({bri:254,sat:254,hue:Math.floor(Math.random()* 65535),on:true,transitionTime:0});
      }, 2000);
    }

    if (device.D == 238) { //It's a relay
      var x = false;
      setInterval(function() {
         device.write(x=!x);
      }, 2000);
    }

});

driver.save = function(config) {
    console.log('Saving opts', config||opts);
    require('fs').writeFileSync('./config.json', JSON.stringify(config||opts));
};

setTimeout(function() {
    app.emit('client::up');


    setTimeout(function() {
      driver.config({
        method: 'startPairing',
        params: {
          pairingTime: 60
        }
      }, function(err, response) {
        console.log('Response from pairing request', err, response);
      });
    }, 4000);
}, 500);
