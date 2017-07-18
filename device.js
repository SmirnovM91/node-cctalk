const CCBus = require('./bus');
const cctalkCmd = require('./command')
const cmd = new cctalkCmd(8);
const defaults = require('defaults-deep');

function CCDevice(bus, config) {
  // initialize prototype only
  if(!bus && !config) {
    return;
  }

  if(typeof bus == 'string') {
   this.bus = new CCBus(bus, config);
  } else {
    this.bus = bus;
  }

  this.commands = {
    simplePoll: 254,
    addressPoll: 253,
    addressClash: 252,
    addressChange: 251,
    addressRandom: 250
  };

  this.config = defaults(config, { dest: 2 });
}

CCDevice.prototype = {
  onBusReady: () => console.log("Warn: CCTalk device proxy doesn't override onBusReady()"),
  onData: command => {
    // Don't do anything by default
  },
  onBusClosed: () =>  console.log("Warn: CCTalk device proxy doesn't override onBusClosed()"),
  sendCommand: command => {
    command.dest = this.config.dest;
    return this.bus.sendCommand(command);
  }
};

module.exports = exports = CCDevice;
