var childProcess = require('child_process'),
  pem = require("pem"),
  fs = require("fs"),
  async = require("async"),
  NodeRSA = require("node-rsa"),
  publicKeyMacaroons = require("public-key-macaroons"),
  path = require("path"),
  handlePrompt = require("./handlePrompt"),
  _ = require("lodash");

//this needs to be separated into own library separate from 3rd party macaroons.
function find3rdPartyCaveatParts(macaroonWithCaveat, secretPem) {
  var macaroonSerialized = macaroonWithCaveat.macaroon;
  var discharge = macaroonWithCaveat.discharge;

  var key = new NodeRSA();
  key.importKey(secretPem);

  var macaroon = MacaroonsBuilder.deserialize(macaroonSerialized);

  var getDischargeParts = getMacPartsFn(" = ");

  var macObj = macaroonPairsToObj(key.decrypt(discharge).toString('utf8'), getDischargeParts);

  var caveatKey = macObj.caveat_key;
  var message = macObj.message;

  var macaroon = MacaroonsBuilder.deserialize(macaroonSerialized);

  var getMacaroonParts = getMacPartsFn(" ");
  var stringMacPairs = macStringToPairs(macaroon.inspect(), getMacaroonParts);

  var identifierLoc = _.findIndex(stringMacPairs, function (pair) {
    return pair[0] === "cid" && pair[1] === "enc = " + discharge;
  });

  var caveatIdentifier = stringMacPairs[identifierLoc][1];
  var caveatLocation = stringMacPairs[identifierLoc + 2][1];//kind of a hack

  return {
    caveatKey: caveatKey,
    macRaw: macaroonSerialized,
    thirdParty: {
      messageObj: macaroonPairsToObj(macObj.message, getDischargeParts),
      identifier: caveatIdentifier,
      location: caveatLocation
    }
  };
}

module.exports = {
  genericBuildAndCreate: function (location, dockerFileLocation, ssh_key, privateKeyLocation, jsonOrFnOrCallback, possibleCallback) {
    var callback = possibleCallback || jsonOrFnOrCallback;
    var jsonOrFn = possibleCallback && jsonOrFnOrCallback;

    var jsonData = jsonOrFn && _.isFunction(jsonOrFn) ? {prompt: 1} : {prompt: 1, data: jsonOrFn};
    console.log("jsonData = %j", jsonData);
    //figure out what the idiot developer was thinking over here
    //need to pass it through as prompt but with data attached

    var ip = location.ip;
    var port = location.port;

    console.log("ip = %j", ip);

    var dockerFileLocationAbsPath = path.resolve(dockerFileLocation);

    console.log("dockerFileLocationAbsPath = %j", dockerFileLocationAbsPath);
    console.log("port = %j", port);
    console.log("ssh_key = %j", ssh_key);
    console.log("privateKeyLocation = %j", privateKeyLocation);

    pem.createCertificate({days:1, selfSigned:true, serviceKey: ((privateKeyLocation && fs.readFileSync(privateKeyLocation)) || null) }, function(err, keys){

      console.log("cert = " + keys.certificate);
      if(!privateKeyLocation) { console.log("priv = %j", keys.serviceKey); }

      var newFolder = __dirname + "/../.tmp";
      // http://stackoverflow.com/questions/21194934/node-how-to-create-a-directory-if-doesnt-exist/21196961#21196961
      if (!fs.existsSync(newFolder)){ fs.mkdirSync(newFolder); }

      function createFileWithData(filename, folder, data){
        var fileInFolder = folder + "/" + filename;
        fs.writeFileSync(fileInFolder, data, "UTF-8", {'flags': 'w+'});
        return {filename: filename, fileInFolder: fileInFolder};
      }

      function fileDetailsToArguments(details, envVarName){
        return  " -f " + details.fileInFolder + 
                " -e " + envVarName + "=" + details.filename;
      }   

      function createQuickDeployArgsAndCreateFileForTransfer(filename, folder, data, envVarName){
        return fileDetailsToArguments(createFileWithData(filename, folder, data), envVarName)
      }

      var certFilenameArgs = createQuickDeployArgsAndCreateFileForTransfer("cert.pem", newFolder, keys.certificate, "CERT_FILENAME");
      var dataFilenameArgs = jsonData ? createQuickDeployArgsAndCreateFileForTransfer("data.json", newFolder, JSON.stringify(jsonData), "DATA_FILENAME") : "";

      var quickDeployCommandString = __dirname + "/../quick-deploy/quick-deploy" + 
        " -i " + ip + 
        " -p " + port + 
        " -d " + dockerFileLocationAbsPath + 
        " -k " + (ssh_key || "$HOME/.ssh/id_rsa") +
        certFilenameArgs +
        dataFilenameArgs +
        "\n";

      var terminal = childProcess.spawn("bash");

      terminal.stdin.write(quickDeployCommandString);

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

        function getServerCert() {
          var splitClientMacaroonLine = outputLines[getElementWithText(outputLines, "cert=")].split("cert=");
          return splitClientMacaroonLine[splitClientMacaroonLine.length - 1];
        }

        return {
          findContainerId: function(){ return findLinePreviousToDone().substring(0, 12); }, //first 12 digits is container id
          getDockerMachineName: getDockerMachineName,
          getClientMacaroon: getClientMacaroon,
          getServerCert: getServerCert
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
        }, 5000);
      }

      function handleMacaroonFound(){
        var outputFns = getDataFromOutput(output);
        var clientMacaroon = outputFns.getClientMacaroon();
        console.log("clientMacaroon = " + clientMacaroon);
        
        if (callback) {callback(JSON.parse(clientMacaroon));}
      }

      function handleCertFound(){
        var outputFns = getDataFromOutput(output);
        var serverCertString = outputFns.getServerCert();
        var containerId = outputFns.findContainerId();

        handlePrompt.handleCertFound(jsonData, serverCertString, keys.serviceKey, function (err, processedJsonData){

          console.log("docker attach " + containerId + "\n")
          terminal.stdin.write("docker attach " + containerId + "\n");
          terminal.stdin.write(JSON.stringify(processedJsonData));

          terminal.stdin.write('\x10\x11\n');
        });
      }

      terminal.stdout.on('data', function (data) {    // register one or more handlers
        console.log('stdout: ' + data);
        output += data;

        if(data && data.toString().indexOf("DONE!!!") !== -1){handleImageRunning();}
        if(data && data.toString().indexOf("client_macaroon") !== -1){handleMacaroonFound();}//need to add buffer to wait for entire piece of data
        if(data && data.toString().indexOf("tuber_prompt") !== -1){handleCertFound();}//need to add buffer to wait for entire piece of data
        if(data && data.toString().indexOf("end_tuber_protocol") !== -1){terminal.stdin.end();}
      });

      terminal.stderr.on('data', function (data) { console.log('stderr: ' + data); });
      terminal.on('exit', function (code) { console.log('child process exited with code ' + code); });
    });
  }
};
