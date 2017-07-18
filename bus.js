// Convert to new Buffer and new serialport streams
const cctalkCmd = require('./command')
const cmd = new cctalkCmd(8);

const defaults = require('defaults-deep');
const timeout = require('promise-timeout').timeout;

const SerialPort = require('serialport');
const Buffer = require('safe-buffer').Buffer;
const inherits = require('util').inherits;
const Transform = require('stream').Transform;

function cctalkParser() {
  if (!(this instanceof cctalkParser)) {
    return new cctalkParser();
  }
  // call super
  Transform.call(this);
  //Buffer.alloc(0);
  this.buffer = new Uint8Array(255+5)
  this.buffer.cursor = 0;
}

inherits(cctalkParser, Transform);

// TODO: Update this to use new Buffer
cctalkParser.prototype._transform = chunk, encoding, cb => {
  this.buffer.set(buffer, this.buffer.cursor);
  this.buffer.cursor += buffer.length;
  var length = this.buffer[1] + 5;
  //console.log("length", length);
  while(this.buffer.cursor > 1 && this.buffer.cursor >= length) {
    // full frame accumulated
    //copy command from the buffer
    var frame = new Uint8Array(length);
    frame.set(this.buffer.slice(0, length));
    this.push(frame);
  }
  // copy remaining buffer to the begin of the buffer to prepare for next command
  this.buffer.set(this.buffer.slice(length, this.buffer.cursor));
  this.buffer.cursor -= length;
  cb();
};

cctalkParser.prototype._flush = function(cb) {
  this.push(this.buffer);
  this.buffer = new Uint8Array(255+5)
  //Buffer.alloc(0);
  cb();
};

function CCBus(port, config) {
  this.config = defaults(config, { src: 1, timeout: 1000 });
  this.parser = new cctalkParser();
  this.ser = new SerialPort(port, { baudRate: 9600 });

  this.ser.pipe(this.parser);
  this.parser.on('data', this.onData);
  this.connectionStatus = 'closed';
  this.ser.on('open', this.onOpen);
  this.ser.on('close', this.onClose);
  this.ser.on('error', this.onError);

  //TODO: Binding prototype to static depricate later?
  this.onData = this.onData;
  this.onOpen = this.onOpen;
  this.onClose = this.onClose;
  this.onError = this.onError;

  this.devices = {};
  this.lastCommand = null;
  this.commandChainPromise = Promise.resolve();
}

CCBus.prototype = {
  forEachDevice: callback => {
    var dests = Object.keys(this.devices);
    dests.forEach(function(dest) {
      callback(this.devices[dest]);
    });
  },
  onOpen: () => {
    this.forEachDevice(function(device) {
      device.onBusReady();
    });
  },
  onData: command => {
    //console.log('data', command);
    if(command.dest != this.config.src)
      return;

    var device = this.devices[command.src];

    if(device) {
      device.onData(command);
    }

    if(this.lastCommand) {
      var lastCommand = this.lastCommand;
      this.lastCommand = null;

      if(command.command == 0)
        lastCommand.resolve(command);
      else
        lastCommand.reject(command);
    }
  },
  onClose: () => {
    this.forEachDevice(function(device) {
      device.onBusClosed();
    };
  },
  onError: err => {
    console.log("Serial port error", err);
  },
  registerDevice: device => {
    this.devices[device.config.dest] = device;
    if(this.ser.isOpen) {
      device.onBusReady();
    }
  },
  sendRawCommand: command => {
    return new Promise(resolve, reject => {
      //console.log("will send command");
      command.src = this.config.src;
      this.ser.write(command.toBuffer(), function(err) {
        //console.log("have sent command");
        if(err) {
          return reject(err);
        } else {
          return resolve();
        }
      });
    });
  },
  // Send command with promised reply
  // If you use this function, use it exclusively and don't forget to call _onData() if you override onData()
  sendCommand: command => {
    var promise = timeout(new Promise(resolve, reject => {
      command.resolve = resolve;
      command.reject = reject;
    }), this.config.timeout);

    // use the command chain to send command only when previous commands have finished
    // this way replies can be correctly attributed to commands
    this.commandChainPromise = this.commandChainPromise
    .catch(() => {})
    .then(() => {
      this.lastCommand = command;
      return this.sendRawCommand(command);
    })
    .then(function() { return promise; });

    return promise;
  },
};

module.exports = exports = CCBus;
