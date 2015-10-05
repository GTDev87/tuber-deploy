var exec = require('child_process').exec;


module.exports = {
  genericBuildAndCreate: function (ip, dockerFileLocation, port, ssh_key) {

    var quickDeployCommand = "./quick-deploy/quick-deploy" + 
      " -i " + ip +
      " -p " + port +
      " -d " + dockerFileLocation + 
      " -k " + (ssh_key || "/Users/GT/.ssh/id_rsa");

    exec(quickDeployCommand, function (error, stdout, stderr) {

      //Send over client certificate or OBC

      //generate macaroon here with [secret key (identifier generated now), location (Machine IP) port, 3rd party caveat SSH IP]

      console.log("error = %j", error);
      console.log("stdout = %j", stdout);
      console.log("stderr = %j", stderr);
      console.log('test run and finished.');
    });
  }
};
