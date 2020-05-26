const path = require('path')

const CoinDetector = require('../src/devices/CoinAcceptors/emp-800-wh.js')

const util = require('util');
const debug = require('debug');
var config


function cctalkDebug(msg) {
  debug('cctalk-devices::debug')(msg)
  return msg
}


var Status = {
  config,
  bv: 'offline',
  cd: 'offline'
};

var MESSAGE = { status: ''};

function toCoins(name,DEVICE) {
  //'EU200A'
  var coin;
  coin = name.replace('EU','').replace('00A','');
  coin = parseInt(coin);
  debug('cctalk::NOTICE::'+DEVICE)('Transformed',name, coin);
  return coin;
}

function toAmount(slot,DEVICE) {
    slotsMap = ['0.10','0.20','0.50','1.00','2.00']
    const amount = slotsMap[slot-1]
    debug('cctalk::NOTICE::'+DEVICE)('Transformed', slot ,amount);
    return amount;
  }
//const io = require('socket.io-client/dist/socket.io.js');

function messageHandler(msg) {
  msg.date = new Date().toISOString();
  MESSAGE = msg;
  console.log(msg)
  debug('cctalk::NOTICE::'+msg.status)(MESSAGE);
}




const cctalk = require('../src/cctalk.js')
var searchFor = 'WHEMP'
var SerialPort = require('serialport');
var CCBus;
SerialPort.list()
  .then(cctalkDebug)
  .then((ports)=>ports.filter((port)=>port.pnpId !== undefined))
  .then(cctalkDebug)
  .then((ports)=>ports.filter((port)=>port.pnpId.indexOf(searchFor) > -1))
  .then(cctalkDebug)
  .then(ports=>{
    /*
    [ { manufacturer: 'wh Berlin',
        serialNumber: 'whEMP0698323',
        pnpId: 'usb-wh_Berlin_EMP_8xx.14_whEMP0698323-if00-port0',
        locationId: undefined,
        vendorId: '0403',
        productId: 'EMP 8xx.14',
        comName: '/dev/ttyUSB0' } ]
     */
    if (ports.length > 0) {
      return ports[0]
    } else {
      return Promise.reject('NotFound: '+searchFor)
    }
  })
  .then(cctalkDebug)
  .then((port)=>{
    console.log(Object.keys(cctalk.bus))
    CCBus = new cctalk.bus(port.path, {autoOpen: false}); // config
    //TODO: Detect Connected BillValidator
    //TODO: Send Every 30 sec a SimplePoll for the BV

    return CCBus.port.open()
  })
  .then(cctalkDebug)
  .then(()=> {

      var cd = new CoinDetector(CCBus);
 
      cd.on('error', function(e) {
        Status.cd = 'error';
        Status.error = e;
        messageHandler({ from: 'coindetector', status: 'error', err: e, stack: e.stack });
      });

      cd.on('accepted', function(slot) {
          const amount = toAmount(slot)
        debug('cctalk::NOTICE::COINDETECTOR')('Accepted',amount);
        //var amount = toCoins(name,'COINDETECTOR');
        messageHandler({ from: 'coindetector', status: 'accepted', coin: amount, amount });
      });
      cd.on('inhibited', function(coin) {
        debug('cctalk::NOTICE::COINDETECTOR')('Inhibited',coin);
        messageHandler({ from: 'coindetector', status: 'inhibited', amount, name, coin });
      });
      cd.on('rejected', function() {
        messageHandler({ from: 'coindetector', status: 'rejected' });
      });

      cd.on('ready', function() {
        Status.cd = 'ready';
        debug('cctalk::NOTICE::COINDETECTOR')('Ready Pooling');
      })

    
}).catch(console.log)