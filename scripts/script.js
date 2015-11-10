#!/usr/bin/env node
var tuberDeploy = require("../lib"),
  argv = require('optimist')
    .demand(['i','d', 'p'])
    .argv;

var ip = argv.i;
var dockerFileLocation = argv.d;
var port = argv.p;
var sshKey = argv.k;
var privateKeyLocation = argv.s;

console.log("ip = %j", ip);
console.log("dockerFileLocation = %j", dockerFileLocation);
console.log("port = %j", port);
console.log("sshKey = %j", sshKey);
console.log("privateKeyLocation = %j", privateKeyLocation);

tuberDeploy.genericBuildAndCreate({ip: ip, port: port}, dockerFileLocation, port, sshKey, privateKeyLocation);