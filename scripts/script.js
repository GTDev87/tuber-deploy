var tuberDeploy = require("../lib"),
  args = process.argv.slice(2)
  ip = args[0],
  dockerFileLocation = args[1],
  port = args[2];

tuberDeploy.genericBuildAndCreate(ip, dockerFileLocation, port);