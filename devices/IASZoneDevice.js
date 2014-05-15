'use strict';

var util = require('util');
var stream = require('stream');

var ZONE_STATE_BITS = [
    'Alarm1',
    'Alarm2',
    'Tamper',
    'Battery',
    'SupervisionReports',
    'RestoreReports',
    'Trouble',
    'AC',
    'Reserved1',
    'Reserved2',
    'Reserved3',
    'Reserved4',
    'Reserved5',
    'Reserved6',
    'Reserved7',
    'Reserved8'
];

function IASZone(cluster, log, deviceId, name) {
  this.cluster = cluster;

  this.writable = true;
  this.V = 0;
  this.D = deviceId;
  this.name = name;

  this.log = log;
  process.nextTick(function() {
    this.emit('ready');
  }.bind(this));

  cluster.on('command', function(command) {
    if (command.commandIdentifier === 0) { // State update
      this.readState(command.payload);
    }
  }.bind(this));
}
util.inherits(IASZone, stream);

IASZone.prototype.readState = function(stateBuffer) {
    this.log.debug('Zone State : ', stateBuffer);

    var state = {};
    stateBuffer.readUInt16LE(0).toString(2).split('').reverse().forEach(function(bit, pos) {
        state[ZONE_STATE_BITS[pos]] = (bit === '1');
    });

    state.timestamp = new Date().getTime();

    this.log.debug('Zone State Parsed : ', state);

    this.emit('data', state.Alarm1?'1':'0');
};

module.exports = IASZone;
