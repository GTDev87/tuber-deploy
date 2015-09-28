var tuberDeploy = require("../lib");

var args = process.argv.slice(2);

//node scripts/script.js <IP> <Path-to-dockerfile-folder> <Port>

var ip = args[0];
var dockerFileLocation = args[1];
var port = args[2];

tuberDeploy.genericBuildAndCreate(ip, dockerFileLocation, port);