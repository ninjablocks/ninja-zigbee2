'use strict';

var util = require('util');
var stream = require('stream');

function MeteringDevice(cluster, log) {
  this.cluster = cluster;

  this.writable = true;
  this.V = 0;
  this.D = 243; // relay
  this.name = 'Metering';

  this.log = log;
  process.nextTick(function() {
    this.emit('ready');
  }.bind(this));

  this.value = cluster.attributes.InstantaneousDemand;

  // XXX: Replace me with reporting
  setInterval(function() {
    this.value.read().then(this.emit.bind(this, 'data'));
  }.bind(this), 5000);
}
util.inherits(MeteringDevice, stream);

module.exports = MeteringDevice;