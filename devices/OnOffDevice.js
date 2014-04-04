'use strict';

var util = require('util');
var stream = require('stream');

function OnOffDevice(cluster, log) {
  this.cluster = cluster;

  this.writable = true;
  this.V = 0;
  this.D = 238; // relay
  this.name = 'On/Off';

  this.log = log;
  process.nextTick(function() {
    this.emit('ready');
  }.bind(this));

  this.value = cluster.attributes.OnOff;

  // XXX: Replace me with reporting
  setInterval(function() {
    this.value.read().then(this.emit.bind(this, 'data'));
  }.bind(this), 5000);
}
util.inherits(OnOffDevice, stream);

OnOffDevice.prototype.write = function(val) {
  this.cluster.commands[!!val?'On':'Off']().then(this.value.read).then(this.emit.bind(this, 'data'));
};

module.exports = OnOffDevice;