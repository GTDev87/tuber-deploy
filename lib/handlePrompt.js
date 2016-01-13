var pem = require("pem"),
  async = require("async"),
  NodeRSA = require("node-rsa"),
  crypto = require('crypto'),
  publicKeyMacaroons = require("public-key-macaroons"),
  MacaroonsBuilder = require('macaroons.js').MacaroonsBuilder,
  _ = require("lodash");

var CHARACTERS_ON_CERTIFICATE_LINE = 64;

function base64WithSplitCharLines(string){
  return _.chain(string)
    .chunk(CHARACTERS_ON_CERTIFICATE_LINE)
    .map(function (str) {return str.join(""); } )
    .value();
}

function condenseCertificate(certVar){
  return certVar
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\n/g, "");
}

function expandPem(string){
  return _.flatten([
    ["-----BEGIN CERTIFICATE-----"],
    base64WithSplitCharLines(string),
    ["-----END CERTIFICATE-----"]
  ], true).join("\n");
}

function getMacPartsFn(delimiter) {
  return function (element) {
    var initialLoc = element.indexOf(delimiter) + delimiter.length;
    var key = element.substring(0, element.indexOf(delimiter));
    var value = element.substring(initialLoc);

    return [key, value];
  }
}

function macStringToPairs(mac, splitterFn) {
  return _.chain(mac.split("\n"))
    .filter(_.identity)
    .map(splitterFn)
    .value();
}

function macaroonPairsToObj(mac, splitterFn) { return _.object(macStringToPairs(mac, splitterFn)); }



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

function handleCertFound(jsonData, serverCertString, keys, returnCallback){
  console.log("jsonData = %j", jsonData);
  console.log("serverCertString = %j", serverCertString);

  function resolveMacs(jsonData, serverCertString, resultCallback) {
    function resolveMac(mac, iterCallback) {
      console.log("mac = %j", mac);
      var macObj = find3rdPartyCaveatParts(mac, keys.serviceKey);

      var messageObj = macObj.thirdParty.messageObj;
      var caveatKey = macObj.caveatKey;
      var caveatIdentifier = macObj.thirdParty.identifier;
      var caveatLocation = macObj.thirdParty.location;

      var caveatKey2 = crypto.createHash('md5').digest('hex');

      var pemCert = expandPem(serverCertString);

      pem.getPublicKey(pemCert, function (err, data) {
        console.log("data = %j", data); 

        var publicKey = data.publicKey;

        console.log("publicKey = %j", publicKey);

        var dischargedSerialized  = new MacaroonsBuilder(caveatLocation, caveatKey, caveatIdentifier)
        .getMacaroon();

        var macWithDischarge2 = publicKeyMacaroons.addPublicKey3rdPartyCaveat(dischargedSerialized, "Macattack", caveatKey2, "cert = " + condenseCertificate(pemCert), publicKey);

        console.log("macWithDischarge2 = %j", macWithDischarge2);        

        iterCallback(null, [mac.macaroon, macWithDischarge2.macaroon, macWithDischarge2.discharge]);
        // iterCallback(null, []);

      });
    }
    function dataIsMac(data) {
      console.log("data = %j", data);
      return data.isMac; 
    }

    async.map(
      jsonData.data, 
      function (data, iterCallback) { return dataIsMac(data) ? resolveMac(data.mac, iterCallback) : iterCallback(null, data); },
      resultCallback);
  }
  //what was i thinking here???? hmmmm

  resolveMacs(jsonData, serverCertString, function (err, processedJsonData) {
    jsonData.data = processedJsonData;
    returnCallback(jsonData);
  });
}

exports.handleCertFound = handleCertFound;
