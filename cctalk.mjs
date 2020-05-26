import { Buffer } from 'buffer';
import { EventEmitter } from "events";
import SerialPort from 'serialport';
import ParserCCTalk from '@serialport/parser-cctalk';
import debug from 'debug'
const parser = new ParserCCTalk();
//TODO: Make a Complet list of CCTalk Commands Sorted by Category to use with devices. and
//TODO: Make a Complet list of CCTalk EventCodes Sorted by Category to use with devices. 
//cmd:,tag:,desc: , cats: []

/*
var cats = [
    default,
    corePlus,
    billValidator,
    coinAcceptor,
    changer,
    escrow,
    payout,
    multiDrop
  ]
  
*/

/*
CCBus = Connection to port with CCTalk protocol
CCCommand = Command in CCTalk Formart
CCDevice = Register a Device on the CCBus
 */

'use strict';
//new 254


class ccTalkMessage {
  // src, dest, command, data, crc all integers
  constructor(src, dest, command, data, crc) {
    //fromBuffer() A buffer always should have a crc checksum already !
    this._origin = data;
    if (src instanceof Uint8Array) {
      // parse command
      this._buffer = src;
      this._src = this._buffer[2];
      this._dest = this._buffer[0];
      this._command = this._buffer[3];
      this._data = this._buffer.slice(4, this._buffer[1]+4);

      this._checksum = this._buffer[this._buffer[1] + 4];

      if (this._checksum == undefined) {
        console.log(this._buffer);
        throw new Error('NO_CHECKSUM');
      } else {
        // Check for CRC8
        if (this.crc8verify()) {
          this._crcType = 8;
          debug('ccMessage:crc')('CRC8_CHECKSUM');
        } else if (this.crc16verify()) {
          this._crcType = 16;
          debug('ccMessage:crc')('CRC16_CHECKSUM');
        } else {
          debug('ccMessage:crc::warning')(this._buffer);
          //throw new Error('WRONG_CHECKSUM');
        }
      }

    } else {
      // create command as src is a int
      if (command == undefined) {
        debug('ccMessage:command')(this._buffer);
        throw new Error('NO_COMMAND');
      } else if (data == undefined) {
        debug('ccMessage:command')(this._buffer);
        throw new Error('NO_DATA');
      }
      this._src = typeof src != undefined ? src : 1;
      this._dest = typeof dest != undefined ? dest : 2;
      this._crcType = typeof crc != undefined ? crc : 8;
      this._command = command;
      this._data = data;
    }
  }
  toBuffer() {
    if (this._buffer == undefined) {
      this._buffer = new Uint8Array(5 + this._data.length);
      this._buffer[0] = this._dest;
      this._buffer[1] = this._data.length;
      this._buffer[2] = this._src;
      this._buffer[3] = this._command;
      this._buffer.set(this._data, 4);
      // console.log('CRC: ', this._crcType)
      if (this._crcType === 8) {
        return this.crc8();
      } else {
        return this.crc16();
      }
    } else {
      return this._buffer;
    }
  }
  calcSum() {
    var sum = 0;
    for (var i = 0; i < (this._buffer.length - 1); ++i) {
        sum += (this._buffer[i]);  
    }
    return sum  
  }
  crc8() {
    // Set Checksum at end
    return this._buffer[this._data.length+4] = 0x100 - this.calcSum()%0x100;
  }
  crc8verify() {
    return (this._buffer[this._data.length+4] != 0x100 - this.calcSum()%0x100) ? false : true;
  }
  calcCrc16() {
    //CRC16-CCITT-xModem signed Buffer
    var UArray = new Uint8Array(3 + this._data.length);
    //Debug stuff
    //[this._buffer[0],this._buffer[1],this._buffer[3]];
    //var UArray = new Uint8Array([this._buffer[0],this._buffer[1],this._buffer[3]]);
    UArray[0] = this._dest;
    UArray[1] = this._data.length;
    UArray[2] = this._command;
    UArray.set(this._data, 3);
    
    /** start https://unpkg.com/browse/crc@3.8.0/crc16xmodem.js */  
    const crc16xmodem = (buf, previous) => {
        if (!Buffer.isBuffer(buf)) {
            buf = Buffer.from(buf);
        }
        
        let crc = typeof previous !== 'undefined' ? ~~previous : 0x0;
        
        for (let index = 0; index < buf.length; index++) {
            const byte = buf[index];
            let code = (crc >>> 8) & 0xff;
        
            code ^= byte & 0xff;
            code ^= code >>> 4;
            crc = (crc << 8) & 0xffff;
            crc ^= code;
            code = (code << 5) & 0xffff;
            crc ^= code;
            code = (code << 7) & 0xffff;
            crc ^= code;
        }
        
        return crc >>> 0;
    }
    /** End https://unpkg.com/browse/crc@3.8.0/crc16xmodem.js */
    return crc16xmodem(Buffer.from(UArray))
        .toString(16)
        .match(/.{1,2}/g)
        .map((val)=> parseInt(val, 16))
        .reverse();
  }
  crc16() {
    const CRCArray = this.calcCrc16() 
    // console.log(CRCArray)
    // Set Checksum first Part at src
    this._buffer.set([CRCArray[0]],2);
    // Set Checksum Secund Part after data
    this._buffer.set([CRCArray[1]], this._buffer[1]+4); // Position after data aka last
    return this._buffer;
  }
  crc16verify() {

    const CRCArray = this.calcCrc16() 

    if ((this._buffer[2] == CRCArray[0]) && (this._buffer[this._buffer[1]+4] == CRCArray[1])) {
      return true;
    } else {
      debug('ccMessage:crc')(this._buffer[2] +'=='+ CRCArray[0],this._buffer[this._buffer[1]+4]+'=='+ CRCArray[1]);
      return false;
    }
  }
}
const CCCommand = ccTalkMessage;

const promiseTimeout = (promise,ms) => {
    // Create a promise that rejects in <ms> milliseconds
    let timeout = new Promise((resolve, reject) => {
      let id = setTimeout(() => {
        clearTimeout(id);
        reject('Timed out in '+ ms + 'ms.')
      }, ms)
    })
  
    // Returns a race between our timeout and the passed in promise
    return Promise.race([
      promise,
      timeout
    ])
}

class CCBus {
    constructor(port, config) {
        //this.parserBuffer = new Uint8Array(255+5);
        //this.parserBuffer.cursor = 0;
        this.parser = parser
        this.config = { ...config, ...{ src: 1, promiseTimeout: 2000 } };
        this.connectionStatus = 'closed';

        this.port = new SerialPort(port, { baudRate: 9600, autoOpen: false });
        this.port.on('error', (err) => console.log('Serial port error', err));

        this.port.pipe(parser);
        

        this.parser.on('data',(data) => {
            var command = new CCCommand(data)
            
            debug('parser::onData')(command._command,(command._dest === this.config.src),this.config)
            //Uint8Array.from(data)
            if(command._dest === this.config.src || command._dest === 0) {
                debug('response::')(command._command,(command._dest === this.config.src))
                this.commandResponse(command)
            }
        })


        this.lastCommand = null;
        this.commandChainPromise = Promise.resolve();
    }
    commandResponse(command) {
        //console.log('data', command);
        debug('response')(JSON.stringify(command))
        // command.dest === 1 as bus is always src 1
        if(this.lastCommand) {
            var lastCommand = this.lastCommand;
            this.lastCommand = null;
            debug('SET LAST COMMAND NULL')((command._command === 0),command)
            if(command._command === 0){
                lastCommand.resolve(command);
            } else {
                lastCommand.reject(command);
            }
        }
    }
    registerDevice(device) {
        this.port.on('close',()=>{ device.onBusClosed(); })
        this.port.on('open',()=>{ device.onBusOpen(); })

        device.on('command',cmdArray=>this.sendCommand(new CCCommand(cmdArray)))
        if (this.port.isOpen) {
            device.onBusOpen();
        }
    }
    // Command needs to be Instance of node-cctalk-command!
    sendCommand(command) {
        //Overwriting the command src this was needed when multiple devices are on the same bus
        command._src = this.config.src;

        // Send command with promised reply
        // If you use this function, use it exclusively and don't forget to call _onData() if you override onData()
        var promise = promiseTimeout(new Promise((resolve, reject) => {
            command.resolve = resolve;
            command.reject = reject;
        }), this.config.promiseTimeout)
            
        .catch(function commandErrorHandler(err) {
            debug('')('COMMAND ERROR')
            debug('')(err, command)
            if (err instanceof promiseTimeout) {
                console.error('Timeout: ', command);
            } else {
                console.log(err);
            }
        });

        // use the command chain to send command only when previous commands have finished
        // this way replies can be correctly attributed to commands
        this.commandChainPromise = this.commandChainPromise
            .then(() => {
                this.lastCommand = command;
                debug('')('SET LAST COMMAND')
                return new Promise((resolve,reject)=> {
                    debug('')(Buffer.from(command.toBuffer()))
                    this.port.write(command.toBuffer(),(err)=>{
                        if(err) {
                            reject(err)
                        } else {
                        resolve()
                        }
                    });
                });
            })
            .then(() => promise)

        return promise
    }
};

class CCDevice extends EventEmitter {
  constructor (bus, config) {
    super()
    this.eventCodes = {};
    this.commands = {
      simplePoll: 254,
      addressPoll: 253,
      addressClash: 252,
      addressChange: 251,
      addressRandom: 250,
      performSelfCheck: 232
    };
    
    if(!bus && !config) {
      // initialize prototype only
      return;
    }
    this.config = { ...config, ...{ src: 1, dest: 2, crc: 8 } };
    this.ready = false;
    if(typeof bus == 'string') {
      this.bus = new CCBus(bus, config);
    } else {
      this.bus = bus;
    }

    this.bus.port.on('close',()=>{ this.onBusClosed(); })
    this.bus.port.on('open',()=>{ this.onBusOpen(); })
    if (this.bus.port.isOpen){
      this.onBusOpen()
    }
  }
  channelToCoin() {
    throw new Error('eventCodes needs to be Implamented on the devices class') 
  }
  exec(cmd, data) {
    // 0 0 , stacker, escrow
    if (typeof cmd === 'string'){
      cmd = this.commands[cmd];
    }
    return this.sendCommand( cmd, data )
      .catch((e) => {
        this.emit('error', e);
        throw e;
      });
  }
  sendCommand(command,data) {
    if (!data) {
      data = new Uint8Array(0); // Buffer.from([])
    }
    //TODO: Should emit simply commands as array bus should listen
    var newCmd = new CCCommand(this.config.src, this.config.dest, command, data, this.config.crc )
    return this.bus.sendCommand(newCmd)
  }
  onBusOpen() {
    debug('device::onBusOpen')(this.ready)
    if (!this.ready) {
      this.exec('simplePoll')
        .then(() => {
          this.ready = true;
          this.emit('ready');
        }, (error) => {
          this.emit('error', error);
        });
      //this.exec('performSelfCheck')
    }
  }
  onBusClosed() {
    this.ready = false;
  }
  parseEventBuffer(events) {
    //debug('cctalk::device::events')(events._data); // Runs always
    if (this.eventCodes.lenght = 0) {
        throw new Error('eventCodes needs to be Implamented on the devices class')   
    }
      
    
    if (this.eventBuffer && events._data[0] != this.eventBuffer[0]) {
        // Debug only Once !!
        debug('cctalk::device::events')(events._data);
        var EventCounter = events._data[0] -  this.eventBuffer[0];
        if(EventCounter > 5){
            // We got more events in Buffer then we Could Process should not Happen if device works
            this.emit('error', new Error('Event overflow. Events generated by the bill detector were lost!'));
        }
        var maxI = Math.min(events._data.length, EventCounter*2+1);

        for(var i = 1; i < maxI; i += 2) {
            var type = events._data[i+1];
            var channel = events._data[i];
            // @ts-ignore
            var coin = this.channelToCoin(channel)

            debug('cctalk::device::events::type')(channel,type,coin);
            switch(type) {
            // @ts-ignore
            case this.eventCodes.accepted:
                this.emit(this.eventCodes[type], coin);
                break;
            case this.eventCodes.escrow:
                if (channel === 0) {
                    debug('cctalk::device::events::type::rejected')(channel,type);
                    this.emit('rejected');
                } else if (channel > 3) {
                    debug('cctalk::device::events::type::return')(coin,'return');
                    this.exec('routeBill',new Uint8Array([0])).catch((e)=>console.log(e))
                } else {
                    debug('cctalk::device::events::type::routeBill')(coin,'routeBill');
                    //this.emit(this.eventCodes[type], channel);
                    this.exec('routeBill',new Uint8Array([1])).catch((e)=>console.log(e))
                }
                break;
            // @ts-ignore
            case this.eventCodes.inhibited:
            // @ts-ignore
            case this.eventCodes.invalidBill:
            // @ts-ignore
            case this.eventCodes.following:
            // @ts-ignore
            case this.eventCodes.rejected:
                this.emit(this.eventCodes[type]);
                break;
                // @ts-ignore
            case this.eventCodes.return:
                this.emit('return');
                break;
            default:
            this.emit('malfunction', [type, channel]);
            this.emit('error', new Error('The device reported a malfunction: Code ' + type + ', ' + channel));
            }
        }
    }
    this.eventBuffer = events._data;
  }
};

export { CCCommand, CCCommand as command, CCBus,CCBus as bus,CCDevice,CCDevice as device }

/*
1 - Core commands
P - Payout commands ( for serial hoppers )

255 Factory set-up and test
254 Simple poll //Core commands
253 Address poll //Multi-drop commands
252 Address clash //Multi-drop commands
251 Address change //Multi-drop commands
250 Address random //Multi-drop commands
249 Request polling priority //Coin Acceptor commands //Bill Validator commands
248 Request status //Coin Acceptor commands
247 Request variable set //Coin Acceptor commands //Payout commands ( for serial hoppers ) //Bill Validator commands //Changer / Escrow commands
246 Request manufacturer id //Core commands
245 Request equipment category id //Core commands
244 Request product code //Core commands
243 Request database version //Coin Acceptor commands
242 Request serial number //Core Plus commands
241 Request software revision //Core Plus commands
240 Test solenoids //Coin Acceptor commands //Changer / Escrow commands
239 Operate motors //Bill Validator commands //Changer / Escrow commands
238 Test output lines //Coin Acceptor commands //Bill Validator commands
237 Read input lines //Coin Acceptor commands //Bill Validator commands //Changer / Escrow commands
236 Read opto states //Coin Acceptor commands //Payout commands ( for serial hoppers ) //Bill Validator commands //Changer / Escrow commands
235 Read DH public key //Core Plus commands
234 Send DH public key //Core Plus commands
233 Latch output lines //Coin Acceptor commands //Bill Validator commands
232 Perform self-check //Coin Acceptor commands //Bill Validator commands //Changer / Escrow commands
231 Modify inhibit status //Coin Acceptor commands //Bill Validator commands //Changer / Escrow commands
230 Request inhibit status //Coin Acceptor commands //Bill Validator commands //Changer / Escrow commands
229 Read buffered credit or error codes //Coin Acceptor commands
228 Modify master inhibit status //Coin Acceptor commands //Bill Validator commands
227 Request master inhibit status //Coin Acceptor commands //Bill Validator commands
226 Request insertion counter //Coin Acceptor commands //Bill Validator commands
225 Request accept counter //Coin Acceptor commands //Bill Validator commands
224 Request encrypted product id //Core Plus commands
223 Modify encrypted inhibit and override registers //Coin Acceptor commands
222 Modify sorter override status //Coin Acceptor commands
221 Request sorter override status //Coin Acceptor commands
220 ACMI encrypted data //Core Plus commands
219 Enter new PIN number //Coin Acceptor commands //Payout commands ( for serial hoppers )
218 Enter PIN number //Coin Acceptor commands //Payout commands ( for serial hoppers )
217 Request payout high / low status //Payout commands ( for serial hoppers )
216 Request data storage availability //Core Plus commands
215 Read data block //Coin Acceptor commands //Payout commands ( for serial hoppers ) //Bill Validator commands //Changer / Escrow commands
214 Write data block //Coin Acceptor commands //Payout commands ( for serial hoppers ) //Bill Validator commands //Changer / Escrow commands
213 Request option flags //Coin Acceptor commands //Bill Validator commands
212 Request coin position //Coin Acceptor commands
211 Power management control
210 Modify sorter paths //Coin Acceptor commands //Changer / Escrow commands
209 Request sorter paths //Coin Acceptor commands //Changer / Escrow commands
208 Modify payout absolute count //Payout commands ( for serial hoppers )
207 Request payout absolute count //Payout commands ( for serial hoppers )
206
205
204 Meter control
203 Display control
202 Teach mode control //Coin Acceptor commands //Bill Validator commands
201 Request teach status //Coin Acceptor commands //Bill Validator commands
200 ACMI unencrypted product id //Core Plus commands
199 Configuration to EEPROM //Coin Acceptor commands
198 Counters to EEPROM //Coin Acceptor commands
197 Calculate ROM checksum //Core Plus commands
196 Request creation date //Core Plus commands
195 Request last modification date //Core Plus commands
194 Request reject counter //Coin Acceptor commands //Bill Validator commands
193 Request fraud counter //Coin Acceptor commands //Bill Validator commands
192 Request build code //Core commands
191 Keypad control
190
189 Modify default sorter path //Coin Acceptor commands
188 Request default sorter path //Coin Acceptor commands
187 Modify payout capacity //Payout commands ( for serial hoppers )
186 Request payout capacity //Payout commands ( for serial hoppers )
185 Modify coin id //Coin Acceptor commands //Changer / Escrow commands
184 Request coin id //Coin Acceptor commands //Changer / Escrow commands
183 Upload window data //Coin Acceptor commands
182 Download calibration info //Coin Acceptor commands
181 Modify security setting //Coin Acceptor commands //Bill Validator commands
180 Request security setting //Coin Acceptor commands //Bill Validator commands
179 Modify bank select //Coin Acceptor commands //Bill Validator commands
178 Request bank select //Coin Acceptor commands //Bill Validator commands
177 Handheld function //Coin Acceptor commands
176 Request alarm counter //Coin Acceptor commands
175 Modify payout float //Payout commands ( for serial hoppers ) //Changer / Escrow commands
174 Request payout float //Payout commands ( for serial hoppers ) //Changer / Escrow commands
173 Request thermistor reading //Coin Acceptor commands //Payout commands ( for serial hoppers )
172 Emergency stop //Payout commands ( for serial hoppers )
171 Request hopper coin //Payout commands ( for serial hoppers )
170 Request base year //Core Plus commands
169 Request address mode //Core Plus commands
168 Request hopper dispense count P
167 Dispense hopper coins //Payout commands ( for serial hoppers )
166 Request hopper status //Payout commands ( for serial hoppers )
165 Modify variable set P //Changer / Escrow commands
164 Enable hopper P
163 Test hopper P
162 Modify inhibit and override registers //Coin Acceptor commands
161 Pump RNG P
160 Request cipher key P
159 Read buffered bill events //Bill Validator commands
158 Modify bill id //Bill Validator commands
157 Request bill id //Bill Validator commands
156 Request country scaling factor //Bill Validator commands
155 Request bill position //Bill Validator commands
154 Route bill //Bill Validator commands
153 Modify bill operating mode //Bill Validator commands
152 Request bill operating mode //Bill Validator commands
151 Test lamps //Bill Validator commands //Changer / Escrow commands
150 Request individual accept counter //Bill Validator commands
149 Request individual error counter //Bill Validator commands
148 Read opto voltages //Bill Validator commands
147 Perform stacker cycle //Bill Validator commands
146 Operate bi-directional motors //Bill Validator commands //Changer / Escrow commands
145 Request currency revision //Bill Validator commands
144 Upload bill tables //Bill Validator commands
143 Begin bill table upgrade //Bill Validator commands
142 Finish bill table upgrade //Bill Validator commands
141 Request firmware upgrade capability //Bill Validator commands //Changer / Escrow commands
140 Upload firmware //Bill Validator commands //Changer / Escrow commands
139 Begin firmware upgrade //Bill Validator commands //Changer / Escrow commands
138 Finish firmware upgrade //Bill Validator commands //Changer / Escrow commands
137 Switch encryption code //Core Plus commands
136 Store encryption code //Core Plus commands
135 Set accept limit //Coin Acceptor commands
134 Dispense hopper value P
133 Request hopper polling value P
132 Emergency stop value P
131 Request hopper coin value P
130 Request indexed hopper dispense count P
129 Read barcode data //Bill Validator commands
128 Request money in //Changer / Escrow commands
127 Request money out //Changer / Escrow commands
126 Clear money counters //Changer / Escrow commands
125 Pay money out //Changer / Escrow commands
124 Verify money out //Changer / Escrow commands
123 Request activity register //Changer / Escrow commands
122 Request error status //Changer / Escrow commands
121 Purge hopper //Changer / Escrow commands
120 Modify hopper balance //Changer / Escrow commands
119 Request hopper balance //Changer / Escrow commands
118 Modify cashbox value //Changer / Escrow commands
117 Request cashbox value //Changer / Escrow commands
116 Modify real time clock //Changer / Escrow commands
115 Request real time clock //Changer / Escrow commands
114 Request USB id //Core Plus commands
113 Switch baud rate //Core Plus commands
112 Read encrypted events //Coin Acceptor commands //Bill Validator commands
111 Request encryption support //Core commands
110 Switch encryption key //Core Plus commands
109 Request encrypted hopper status //Payout commands ( for serial hoppers )
108 Request encrypted monetary id //Coin Acceptor commands //Bill Validator commands
107 Operate escrow //Changer / Escrow commands
106 Request escrow status //Changer / Escrow commands
105 Data stream //Core Plus commands
104 Request service status //Changer / Escrow commands
103 Expansion header 4
102 Expansion header //Multi-drop commands
101 Expansion header //Core Plus commands
100 Expansion header //Core commands
99 Application specific to 20
19 to 7 Reserved
6 BUSY message //Core Plus commands
5 NAK message //Core Plus commands
4 Request comms revision //Core Plus commands
3 Clear comms status variables //Coin Acceptor commands //Payout commands ( for serial hoppers ) //Bill Validator commands
2 Request comms status variables //Coin Acceptor commands //Payout commands ( for serial hoppers ) //Bill Validator commands
1 Reset device //Core Plus commands
0 Return message
*/
/*
Public Domain Document
ccTalk Generic Specification - Crane Payment Solutions - Page 7 of 87 - ccTalk Part 3 v4.7.doc
While every effort has been made to ensure the accuracy of this document no liability of any kind is
accepted or implied for any errors or omissions that are contained herein.
1.1 Core Commands
These are the commands which should be supported by all ccTalk peripherals. They
*/

export class emp800 extends CCDevice {
  constructor(bus, config) {
    super(bus,config)
    this.eventCodes = {
        254: 'return',
        20: 'string',
        19: 'slow',
        13: 'busy',
        8: 'following',
        2: 'inhibited',
        1: 'rejected',
        0: 'accepted',
        accepted: 0,
        rejected: 1,
        inhibited: 2,
        following: 8,
        busy: 13,
        slow: 19,
        string: 20,
        'return': 254
      
    }  
      this.commands = {
          ...{
              requestStatus: 248,
              requestVariableSet: 247,
              requestManufacturerId: 246,
              requestEquipmentCategoryId: 245,
              requestProductCode: 244,
              requestDatabaseVersion: 243,
              requestSerialNumber: 242,
              requestSoftwareRevision: 241,
              testSolenoids: 240,
              testOutputLines: 238,
              readInputLines: 237,
              readOptoStates: 236,
              latchOutputLines: 233,
              performSelfCheck: 232,
              modifyInhibitStatus: 231,
              requestInhibitStatus: 230,
              readBufferedCredit: 229,
              modifyMasterInhibit: 228,
              requestMasterInhibitStatus: 227,
              requestInsertionCounter: 226,
              requestAcceptCounter: 225,
              modifySorterOverrideStatus: 222,
              requestSorterOverrideStatus: 221,
              requestDataStorageAvailability: 216,
              requestOptionFlags: 213,
              requestCoinPosition: 212,
              modifySorterPath: 210,
              requestSorterPath: 209,
              teachModeControl: 202,
              requestTeachStatus: 201,
              requestCreationDate: 196,
              requestLastModificationDate: 195,
              requestRejectCounter: 194,
              requestFraudCounter: 193,
              requestBuildCode: 192,
              modifyCoinId: 185,
              requestCoinId: 184,
              uploadWindowData: 183,
              downloadCalibrationInfo: 182,
              requestThermistorReading: 173,
              requestBaseYear: 170,
              requestAddressMode: 169,
              requestCommsRevision: 4,
              clearCommsStatusVariables: 3,
              requestCommsStatusVariables: 2,
              resetDevice: 1
          }, ...this.commands
      }
    // register last, after all device type specific variables have been set up!
    //this.bus.registerDevice(this);
    this.on('ready',()=>this.onReady())
  }
  onReady(){
    debug('CCTALK')('emp800-ready');
    this.ready = true;
    this.pollInterval = setInterval(()=> {
      this.poll()
    }, 999);
    this.enableAcceptance()
      .then(()=>this.setAcceptanceMask(0xFFFF));
  }
  poll() {
    if (this.ready) {
      this.exec('readBufferedCredit').then((buffer)=>{
        this.parseEventBuffer(buffer)
      });
    } else {
      debug('CoinAcceptor::poll()')(this.ready)
    }
  }
  setAcceptanceMask(acceptanceMask) {
    return this.exec('modifyInhibitStatus',  Uint8Array.from([ acceptanceMask & 0xFF, (acceptanceMask >> 8) & 0xFF ]))
  }
  enableAcceptance(){
    return this.exec('modifyMasterInhibit', new Uint8Array(1).fill(0xFF))
  }
  disableAcceptance(){
    return this.exec('modifyMasterInhibit', new Uint8Array(1).fill(0x00))
  }
  channelToCoin(channel) {
    const channelsMap = ['0.10','0.20','0.50','1.00','2.00']
    const coin = channelsMap[channel-1]
    debug('cctalk::NOTICE::')('Channel=>', channel ,coin);
    return coin;
  }
  getCoinName(channel){
    return this.exec('requestCoinId', Uint8Array.from([ channel ]))
      .then((reply) => {
        return String.fromCharCode.apply(null, reply.data);
      });
  }
  getCoinPosition(channel){
    return this.exec('requestCoinPosition', Uint8Array.from([ channel ]));
  }
  
  
  
}

// Taiko Pub7
export class BillValidator extends CCDevice {
    constructor(bus, config) {
      super(bus, config);
      // register last, after all device type specific variables have been set up!
        
        this.eventCodes = {
            20: 'barcode',
            19: 'antiStringError',
            18: 'string',
            17: 'optoFraud',
            16: 'billJammed',
            13: 'stackerError',
            8: 'following',
            4: 'inhibited',
            2: 'invalidBill',
            1: 'escrow',
            0: 'accepted',
            accepted: 0, // stacker
            escrow: 1, // Escrow
            invalidBill: 2,
            following: 8,
            busy: 13,
            string: 18,
            antiStringError: 19,
            barcode: 20,
            'return': 254
          }
        this.commands = {
            requestStatus: 248,
            requestVariableSet: 247,
            requestManufacturerId: 246,
            requestEquipmentCategoryId: 245,
            requestProductCode: 244,
            requestDatabaseVersion: 243,
            requestSerialNumber: 242,
            requestSoftwareRevision: 241,
            testSolenoids: 240,
            testOutputLines: 238,
            readInputLines: 237,
            readOptoStates: 236,
            latchOutputLines: 233,
            performSelfCheck: 232,
            modifyInhibitStatus: 231,
            requestInhibitStatus: 230,
            modifyMasterInhibit: 228, // 228  001
            requestMasterInhibitStatus: 227,
            requestInsertionCounter: 226,
            requestAcceptCounter: 225,
            modifySorterOverrideStatus: 222,
            requestSorterOverrideStatus: 221,
            requestDataStorageAvailability: 216,
            requestOptionFlags: 213,
            requestCoinPosition: 212,
            modifySorterPath: 210,
            requestSorterPath: 209,
            teachModeControl: 202,
            requestTeachStatus: 201,
            requestCreationDate: 196,
            requestLastModificationDate: 195,
            requestRejectCounter: 194,
            requestFraudCounter: 193,
            requestBuildCode: 192,
            modifyCoinId: 185,
            requestCoinId: 184,
            uploadWindowData: 183,
            downloadCalibrationInfo: 182,
            requestThermistorReading: 173,
            requestBaseYear: 170,
            requestAddressMode: 169,
            readBufferedBill: 159, //Bill Validator commands
            modifyBillId: 158,  //Bill Validator commands
            requestBillId: 157,  //Bill Validator commands  157  001 - xxx looks like that countries_list
            requestCountryScalingFactor: 156, //Bill Validator commands
            requestBillPosition: 155, //Bill Validator commands
            routeBill: 154, //Bill Validator commands
            modifyBillOperatingMode: 153, //Bill Validator commands 000
            requestBillOperatingMode: 152,  //Bill Validator commands
            testLamps: 151,  //Bill Validator commands /Changer / Escrow commands
            requestIndividualAcceptCounter: 150,  //Bill Validator commands
            requestIndividualErrorCounter: 149,  //Bill Validator commands
            readOptoVoltages: 148,  //Bill Validator commands
            performStackerCycle: 147,  //Bill Validator commands
            operateBiDirectionalMotors: 146,  //Bill Validator commands Changer  Escrow commands
            requestCurrencyRevision: 145,  //Bill Validator commands
            uploadBillTables: 144,  //Bill Validator commands
            beginBillTableUpgrade: 143,  //Bill Validator commands
            finishBillTableUpgrade: 142,  //Bill Validator commands
            requestFirmwareUpgradeCapability: 141, //Bill Validator commands: 141,  //Changer / Escrow commands
            uploadFirmware: 140,  //Bill Validator commands /Changer / Escrow commands
            beginFirmwareUpgrade: 139,  //Bill Validator commands /Changer / Escrow commands
            finishFirmwareUpgrade: 138,  //Bill Validator commands /Changer / Escrow commands
            requestCommsRevision: 4,
            clearCommsStatusVariables: 3,
            requestCommsStatusVariables: 2,
            resetDevice: 1,
            ...this.commands
        };
  
      this.bus.registerDevice(this);
      this.on('ready',()=> {
        this.init()
      })
    }
    /*
      Result A Result B Event Type
  
      Bill type 1 to 255  0  validated correctly and sent to cashbox / stacker Credit
      1 to 255 1 Bill type 1 to 255 validated correctly and held in escrow Pending Credit
      0 0 Master inhibit active Status
      0 1 Bill returned from escrow Status
      0 2 Invalid bill ( due to validation fail ) Reject
      0 3 Invalid bill ( due to transport problem ) Reject
      0 4 Inhibited bill ( on serial ) Status
      0 5 Inhibited bill ( on DIP switches ) Status
      0 6 Bill jammed in transport ( unsafe mode ) Fatal Error
      0 7 Bill jammed in stacker Fatal Error
      0 8 Bill pulled backwards Fraud Attempt
      0 9 Bill tamper Fraud Attempt
      0 10 Stacker OK Status
      0 11 Stacker removed Status
      0 12 Stacker inserted Status
      0 13 Stacker faulty Fatal Error
      0 14 Stacker full Status
      0 15 Stacker jammed Fatal Error
      0 16 Bill jammed in transport ( safe mode ) Fatal Error
      0 17 Opto fraud detected Fraud Attempt
      0 18 String fraud detected Fraud Attempt
      0 19 Anti-string mechanism faulty Fatal Error
      0 20 Barcode detected Status
      0 21 Unknown bill type stacked Status
   */
    
    init() {
      debug('CCTALK')('jmcReady-ready');
      //br.selfTest();
      var EU_AS_HEX = new Uint8Array([69,85])
      this.exec('requestBillId', new Uint8Array([1]))
        .then(()=>this.exec('requestBillId', new Uint8Array([1])))
        .then(()=>this.exec('requestBillId', new Uint8Array([2])))
        .then(()=>this.exec('requestBillId', new Uint8Array([3])))
        .then(()=>this.exec('requestCountryScalingFactor', EU_AS_HEX))
        .then(()=>this.exec('requestCurrencyRevision', EU_AS_HEX))
        .then(()=>this.exec('modifyBillOperatingMode', new Uint8Array([3]))) // NO ESCROW NO STACKER 3 = both enabled 2 = only stacker
      //this.setAcceptanceMask(); // 0xFFFF modifyInhibitStatus 255,255 // 255 1 0 0 0 0 0 0 //TODO: Needs Check  this.setAcceptanceMask(0xFFFF);
        .then(()=>this.exec('modifyInhibitStatus', new Uint8Array([255,255,255]))) // [255,1] ==== alll [255,255,255]
      //this.enableAcceptance(); // modifyMasterInhibit 1
        .then(()=>this.exec('modifyMasterInhibit', Buffer.from([[1]])))
        .then(()=> {
          this.pollInterval = setInterval(()=>{this.poll();}, 900)
          //this.exec('requestBillOperatingMode').then(console.log).then(process.exit(1))
          return true
        });
  
  
    }
    poll() {
      if (this.ready) {
        this.exec('readBufferedBill').then((buffer)=> this.parseEventBuffer(buffer));
      }
    }
    // @ts-ignore
    modifyBillOperatingMode(operatingMode){
      // 0 0 , stacker, escrow
      //return this.sendCommand( this.commands.modifyBillOperatingMode,
      //Uint8Array.from([ operatingMode & 0xFF, (operatingMode >> 8) & 0xFF ]))
      //153
      return this.exec('modifyBillOperatingMode', new Uint8Array([1]))
        //.then(console.log)
    }
    setAcceptanceMask(acceptanceMask){
      // example:   231  255  255
      //all-> 231 255 1 0 0 0 0 0 0
      // Uint8Array.from([ acceptanceMask & 0xFF, (acceptanceMask >> 8) & 0xFF ]) == Uint8Array [ 255, 255 ]
      //
      if (!acceptanceMask) {
        acceptanceMask = 0xFFFF;
      }
      // Experiment replaced 255 255 with 255 1 === all?
      return this.exec('modifyInhibitStatus', new Uint8Array([255,1]))
    }
    enableAcceptance(){
      //228  001
      //_> new Uint8Array(1).fill(0xFF) == Uint8Array [ 255 ] new Buffer(1).from([255]) new Buffer.from([255,255]).readUInt8()
      return this.exec('modifyMasterInhibit', Buffer.from([[1]]))
    }
    selfTest() {
      return this.exec('performSelfCheck')
    }
    disableAcceptance() {
      return this.exec('modifyMasterInhibit', new Uint8Array(1).fill(0x00))
    }
    channelToCoin(channel) {
      var channelToCoin = ['rejected', '5', '10', '20', '50']
      return channelToCoin[channel-1]
    }
    getBillName(channel) {
      return this.channelToCoin(channel)
      /*
      return this.exec('requestBillId', Uint8Array.from([ channel ]))
        //TODO: here is a good place to verify that the Reply wich is a command has a valid crc :)
        .then((reply) => {
          console.log(reply)
          String.fromCharCode.apply(null, reply._data)
        });
      */
    }
    getBillPosition(channel) {
      return this.exec('requestBillPosition', Uint8Array.from([ channel ]));
    }
  }