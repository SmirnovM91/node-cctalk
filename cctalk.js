module.exports =
{
  CCCommand: require('./command'),
  CCBus: require('./bus'),
  CCDevice: require('./device'),
  CoinDetector: require('./coindetector')
};
// running this file as main
if(!module.parent) {
  var cd = new module.exports.CoinDetector('/dev/ttyUSB0');

  cd.on('error', (e) => console.log(e));

  cd.on('ready', () => {
    try {
      console.log('ready');
      cd.enableAcceptance();
      cd.setAcceptanceMask(0xFFFF);

      cd.on('error', (e) => console.log('error', e));
      cd.on('accepted', (c) => {
        console.log('Accepted', c);
        cd.getCoinName(c).then((name) => console.log(name));
      });
      cd.on('inhibited', (c) => {
        console.log('Inhibited', c);
        cd.getCoinName(c).then((name) => console.log(name));
      });
      cd.on('rejected', (c) => console.log('Rejected', c));
    }
    catch(e) {
      console.log(e, e.stack);
    }
  });
}
