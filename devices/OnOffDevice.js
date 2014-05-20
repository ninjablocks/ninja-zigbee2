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
  var value = (val === '1' || val === 1 || val === true || val === 'true');
  this.cluster.commands[!!value?'On':'Off']().then(this.value.read).then(this.emit.bind(this, 'data'));
};

module.exports = OnOffDevice;
