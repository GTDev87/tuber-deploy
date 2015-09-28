var machine = require("dockermachine"),
  DockerCmd = require("docker-cmd"),
  dockerCmd = new DockerCmd(),
  exec = require('child_process').exec;

function buildDockerFile(envName, dockerFileLocation, dockerName, portRelation) {

  var envCommand = 'eval "$(docker-machine env ' + envName + ')"';
  console.log("envCommand = %j", envCommand);

  var buildCommand = "docker build --rm -t " + dockerName + " " + dockerFileLocation;
  console.log("buildCommand = %j", buildCommand);

  var runCommand = "docker run -d -p " + portRelation + " " + dockerName;
  console.log("runCommand = %j", runCommand);

  var fullCommand = [envCommand, buildCommand, runCommand].join(" ; ")
  console.log("fullCommand = %j", fullCommand);

  exec(fullCommand, function (error, stdout, stderr) {
    console.log("error = %j", error);
    console.log("stdout = %j", stdout);
    console.log("stderr = %j", stderr);
    console.log('test run and finished.');
  })
}

function switchEnv(envName, callback) {
  
  console.log("command = %j", command);
  exec(command, callback);
}

module.exports = {
  genericBuildAndCreate: function (ip, dockerFileLocation, port) {

    var portRelation = port + ":80";

    var dockerName = ip  + dockerFileLocation.replace(/\//g, "_").toLowerCase() + "-image"; //may not need this
    console.log("dockerName = %j", dockerName);
    var machineCreateOptions = { "driver" : "generic", "generic-ip-address" : ip};

    console.log ("going to run machine");
    var name = ip + "-machine";

    machine.create(name, machineCreateOptions).then(function (output) {
        
      buildDockerFile(name, dockerFileLocation, dockerName, portRelation);
      
    }).fail(function(err){
      if(err.indexOf("Error creating machine: Machine " + name + " already exists") == 0) {
        buildDockerFile(name, dockerFileLocation, dockerName, portRelation);
      }
      console.log("fail");
      console.log(err);
    });
  }
};
