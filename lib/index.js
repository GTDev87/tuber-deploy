var terminal = require('child_process').spawn("bash"),
  pem = require("pem"),
  quote = require('shell-quote').quote,
  fs = require("fs"),
  _ = require("lodash");


module.exports = {
  genericBuildAndCreate: function (ip, dockerFileLocation, port, ssh_key, privateKeyLocation) {
    console.log("ip = %j", ip);
    console.log("dockerFileLocation = %j", dockerFileLocation);
    console.log("port = %j", port);
    console.log("ssh_key = %j", ssh_key);
    console.log("privateKeyLocation = %j", privateKeyLocation);


    pem.createCertificate({days:1, selfSigned:true, serviceKey: ((privateKeyLocation && fs.readFileSync(privateKeyLocation)) || null) }, function(err, keys){

      // console.log("cert = " + keys.certificate);
      console.log("privateKeyLocation = %j", privateKeyLocation);
      if(!privateKeyLocation) { 
        console.log("priv = %j", keys.serviceKey); 
      }
      

      var filename = "cert.pem";
      var newFolder = __dirname + "/../.tmp";
      var newFile = newFolder + "/" + filename;

      // http://stackoverflow.com/questions/21194934/node-how-to-create-a-directory-if-doesnt-exist/21196961#21196961
      if (!fs.existsSync(newFolder)){ fs.mkdirSync(newFolder); }

      fs.writeFileSync(newFile, keys.certificate, "UTF-8", {'flags': 'w+'});

      terminal.stdin.write(
        "./quick-deploy/quick-deploy" + 
        " -i " + ip + 
        " -p " + port + 
        " -d " + dockerFileLocation + 
        " -k " + (ssh_key || "$HOME/.ssh/id_rsa") +
        " -f " + newFile +
        " -e " + "CERT_FILENAME=" + filename + 
        "\n");

      var output = "";

      function getElementWithText(outputLines, text){ return _.findIndex(outputLines, function (line) {return line.indexOf(text) !== -1;}); }

      function getDataFromOutput(outputString) {
        var outputLines = outputString.split("\n")

        function findLinePreviousToDone() { return outputLines[getElementWithText(outputLines, "DONE!!!") - 1]; }

        function getDockerMachineName() {
          var splitMachineLine = outputLines[getElementWithText(outputLines, "MACHINE_NAME")].split(" ");
          return splitMachineLine[splitMachineLine.length - 1];
        }

        function getClientMacaroon() {
          var splitClientMacaroonLine = outputLines[getElementWithText(outputLines, "client_macaroon=")].split("client_macaroon=");
          return splitClientMacaroonLine[splitClientMacaroonLine.length - 1];
        }

        return {
          findContainerId: function(){ return findLinePreviousToDone().substring(0, 12); }, //first 12 digits is container id
          getDockerMachineName: getDockerMachineName,
          getClientMacaroon: getClientMacaroon
        };
      }

      function handleImageRunning() {
        var outputFns = getDataFromOutput(output);
        
        var containerId = outputFns.findContainerId();
        var machineName = outputFns.getDockerMachineName();

        console.log("containerId = " + containerId);
        console.log("machineName = " + machineName);

        terminal.stdin.write('eval "$(docker-machine env ' + machineName + ')"\n');
        setTimeout(function() {
          terminal.stdin.write("docker logs " + containerId + "\n");
          terminal.stdin.write("echo docker logs " + containerId + "\n");
          terminal.stdin.end();
        }, 2000);
      }

      function handleMacaroonFound(){
        var outputFns = getDataFromOutput(output);

        var clientMacaroon = outputFns.getClientMacaroon();
        console.log("clientMacaroon = " + clientMacaroon);
      }

      terminal.stdout.on('data', function (data) {    // register one or more handlers
        console.log('stdout: ' + data);
        output += data;

        if(data && data.toString().indexOf("DONE!!!") !== -1){handleImageRunning();}
        if(data && data.toString().indexOf("client_macaroon") !== -1){handleMacaroonFound();}
      });

      terminal.stderr.on('data', function (data) { console.log('stderr: ' + data); });
      terminal.on('exit', function (code) { console.log('child process exited with code ' + code); });
    });
  }
};
