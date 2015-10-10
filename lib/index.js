var spawn = require('child_process').spawn;
var pem = require("pem");
var quote = require('shell-quote').quote;
var fs = require("fs");


module.exports = {
  genericBuildAndCreate: function (ip, dockerFileLocation, port, ssh_key) {

    pem.createCertificate({days:1, selfSigned:true}, function(err, keys){

      console.log("cert = " + keys.certificate);
      console.log("priv = " + keys.serviceKey);

      function escapeShell(cmd) {
        return cmd.replace(/\n/g, "\\\\n");
      };

      var filename = "cert.pem";
      var newFolder = __dirname + "/../.tmp";
      var newFile = newFolder + "/" + filename;

      console.log("newFolder = %j", newFolder);
      console.log("newFile = %j", newFile);

      var fs = require('fs');

      // http://stackoverflow.com/questions/21194934/node-how-to-create-a-directory-if-doesnt-exist/21196961#21196961
      if (!fs.existsSync(newFolder)){ fs.mkdirSync(newFolder); }
      console.log("here")
      
      fs.writeFileSync(newFile, keys.certificate, "UTF-8", {'flags': 'w+'});

      var quick_deploy = spawn("./quick-deploy/quick-deploy", [
        "-i", ip,
        "-p", port,
        "-d", dockerFileLocation,
        "-k", (ssh_key || "/Users/GT/.ssh/id_rsa"),
        "-f", newFile,
        "-e", "CERT_FILENAME=" + filename]) ;

      quick_deploy.stdout.on('data', function (data) {    // register one or more handlers
        console.log('stdout: ' + data);
      });

      quick_deploy.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
      });

      quick_deploy.on('exit', function (code) {
        console.log('child process exited with code ' + code);
      });
    });
  }
};
