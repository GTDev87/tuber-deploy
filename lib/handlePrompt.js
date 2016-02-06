var pem = require("pem"),
  async = require("async"),
  NodeRSA = require("node-rsa"),
  crypto = require('crypto'),
  publicKeyMacaroons = require("public-key-macaroons"),
  macaroons = require('node-macaroons'),
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

  var getDischargeParts = getMacPartsFn(" = ");
  var macObj = macaroonPairsToObj(key.decrypt(discharge).toString('utf8'), getDischargeParts);
  var caveatKey = macObj.caveat_key;
  var message = macObj.message;
  
  var macaroon = macaroons.deserialize(macaroonSerialized);


  var getMacaroonParts = getMacPartsFn(" ");
  var stringMacPairs = macStringToPairs(macaroons.details(macaroon), getMacaroonParts);

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

function handleCertFound(jsonData, serverCertString, privKey, returnCallback){

  function resolveMacs(jsonData, serverCertString, resultCallback) {
    function resolveMac(mac, iterCallback) {
      var macObj = find3rdPartyCaveatParts(mac, privKey);

      var rootMac = macaroons.deserialize(mac.macaroon);

      var messageObj = macObj.thirdParty.messageObj;
      var caveatKey = macObj.caveatKey;
      var caveatIdentifier = macObj.thirdParty.identifier;
      var caveatLocation = macObj.thirdParty.location;

      var caveatKey2 = crypto.createHash('md5').digest('hex');

      var serverPemCert = expandPem(serverCertString);
      // console.log(pem.getPublicKey.toString());

      debugger


      pem.getPublicKey(serverPemCert, function (err, data) {
        var publicKey = data.publicKey;

        function getDischarge(loc, thirdPartyLoc, cond, onOK, onErr) {
          onOK(macaroons.newMacaroon(caveatKey, caveatIdentifier, caveatLocation));
        }

        macaroons.discharge(rootMac, getDischarge, function(discharges) {
          var lastDischarge = discharges[discharges.length - 1];
          var macWithDischarge2 = publicKeyMacaroons.addPublicKey3rdPartyCaveat(lastDischarge, "Macattack", caveatKey2, "cert = " + condenseCertificate(serverPemCert), publicKey);
          iterCallback(null, [mac.macaroon, macWithDischarge2.macaroon, macWithDischarge2.discharge]);
        }, iterCallback);
      });

    }
    function dataIsMac(data) { return data.isMac; }

    async.mapSeries(
      jsonData.data, 
      function (data, iterCallback) { return dataIsMac(data) ? resolveMac(data.mac, iterCallback) : iterCallback(null, data); },
      resultCallback);
  }

  //what was i thinking here???? hmmmm

  resolveMacs(jsonData, serverCertString, function (err, processedJsonData) {
    jsonData.data = processedJsonData;
    returnCallback(err, jsonData);
  });
}

exports.handleCertFound = handleCertFound;