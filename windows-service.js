var Service = require('node-windows').Service;

var svc = new Service({
  name:'Node-Red',
  description: 'A visual tool for wiring the Internet of Things',
  script: require('path').join(__dirname,'red.js')
});

svc.on('install',function(){
  svc.start();
});

svc.on('uninstall',function(){
  console.log('Uninstall complete.');
  console.log('The service exists: ',svc.exists);
});

if (process.argv.length == 3) {
  if ( process.argv[2] == 'install') {
    svc.install();
  } else if ( process.argv[2] == 'uninstall' ) {
    svc.uninstall();
  }
}