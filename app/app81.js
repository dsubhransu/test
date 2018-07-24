var express = require('express');
var config = require('./config.json');
var log = require('./lib/errorLog.js').enterLog;
var url = require('url');
var fs = require('fs');
var querystring = require('querystring');
var util = require('util');

var redis = require("redis")
var client = redis.createClient();
var pub = redis.createClient();

var app = express();

var privateKey  = fs.readFileSync('./Keys/key.pem');
var certificate = fs.readFileSync('./Keys/key-cert.pem');
var credentials = {key: privateKey, cert: certificate};

var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var server1 = require('https').createServer(credentials,app);
 
server.listen(81); //http
server1.listen(444); //https

client.on("error", function (err) {
  console.log("error event - " + client.host + ":" + client.port + " - " + err);
});

//client.hset("defaultkey","default",'hello',redis.print);

var netid;
function common(myresult){ //comn fn1 
  var finalresult = [];
  var temp = JSON.parse(myresult);
  temp.forEach(function(v){
    finalresult.push(JSON.parse(v));
  });
  return finalresult;
}

function common1(myresult1){ //comn fn2 
  var finalresult1 = [];
  var temp1 = JSON.parse(myresult1);
  finalresult1.push(temp1);
  return finalresult1;
}

function ssid_callback(s,res){
  ssid = s["SSID_CONFIG"];
  console.log("ssiddddddddd")
  client.get(ssid, function(ssid_err,ssid_res){
    if(typeof(ssid_res) == (null || undefined)){
      acl_callback(s,res);
    } else {
      ssid_res = JSON.parse(ssid_res);
      var ssids = []; var u=0;
      for (i in ssid_res) {
	client.get(ssid_res[i], function(ssid_res_err,ssid_result){
	  ssids.push(JSON.parse(ssid_result))
	  u = u + 1;
	  if (u == ssid_res.length ){
	    s["SSID_CONFIG"] = ssids;
	    acl_callback(s,res)
	  }
	});
      }
    }
  });
}

function acl_callback(s,res){
  var acl = s["ACL_CONFIG"];
  if (acl!= undefined && acl.length >=1){
    var acls = []; var u = 0;
    for (i = 0;i < acl.length;i++) {
      client.get(acl[i], function(acl_err,acl_result){
	if(acl_result != (null || undefined)){
	  console.log("parsing acl results ----------------->")
	  console.log(common(acl_result))
	  acls.push.apply(acls, common(acl_result));
	  u = u + 1;
	  if (u == acl.length ){
	    s["ACL_CONFIG"] = acls;
	    vlan_callback(s,res);
	  }
	}
      });
    }
 } else {
   vlan_callback(s,res);
 }
}

function vlan_callback(s,res){
  var vlan = s["VLAN_CONFIG"]
  if (vlan!= undefined && vlan.length >=1){
    console.log("parsing vlan is present ----------------->")
    var vlans = []; var u = 0;
    for (i = 0;i < vlan.length;i++) {
      client.get(vlan[i], function(vlan_err,vlan_res){ 
	if(typeof(vlan_res) != (null || undefined)){
	  vlans.push(JSON.parse(vlan_res));
	  u = u + 1;
	  if (u == vlan.length ){
	    s["VLAN_CONFIG"] = vlans;
	    port_forwading_callback(s,res);  
	  }
	}        
      })
    }
  } else {
    console.log("parsing vlan else results ----------------->")
    port_forwading_callback(s,res);
  }
}

function port_forwading_callback(s,res){
  var port_config = s["PORT_FWD_CONFIG"];
  if (port_config!= undefined && port_config.length >=1){
    uniqueport = port_config.filter(function(elem, index, self) {
      return index == self.indexOf(elem);
    });
     var ports = []; var u = 0;
      for (i = 0;i < uniqueport.length;i++) {
        client.get(uniqueport[i], function(port_err,port_res){
	  if(port_res != (null || undefined)){
	    ports.push.apply(ports, common(port_res));
	    u = u + 1;
	    if (u == uniqueport.length ){
	       s["PORT_FWD_CONFIG"] = ports;
	       send_response_callback(s,res);  
	    }
	  }    
        })
      }
      console.log("parsing port results ----------------->")
  } else {
    console.log("parsing port else results ----------------->")
    send_response_callback(s,res);
  }
}

function send_response_callback(s,res){
  console.log("sending results ----------------->")
  console.log(s);
  res.send(s);
}

function mainfn_call (nwurl,req,res) {
  queryparam = JSON.parse(nwurl); //parse and set to queryparam
  //console.log(queryparam);
  macid = queryparam.INFO.NASID; //get the macid value
  CONSUME_ID = queryparam.INFO["CONSUME_ID"];  //get the consume_id;
  pub.publish('bravo', nwurl); //publishing to bravo channel using redis

  //redis part (getting details based on macid)
  client.get(macid, function (err, result) {
    if (err || result == (undefined || null)){ //main if
      client.get("default", function(err1,result1){
	var def = JSON.parse(result1);
	cons_id = def.BASIC_CONFIG.CONSUME_ID;
	if(cons_id == CONSUME_ID){
	  res.send("{ status : true }");
	} else {
	  res.send(result1);
	}
      });
    } else { //main else
      s = JSON.parse(result); //parse the result to convert to json
      //getting consume-id,ssid from url result after parsing it
      cons_id = s.BASIC_CONFIG.CONSUME_ID;
      netid = s["NETWORK_ID"];
      if(netid == undefined){
	netid = "news";
      }
      io.sockets.emit(netid,nwurl);

      if(cons_id == undefined || cons_id != CONSUME_ID){ //sub-if
	cmdarry = [];
	publish_data = {};
	if(s["COMMANDS"] != undefined || s["COMMANDS"].length >=1){ // for commands
	  for (var i = 0; i <  s["COMMANDS"].length ; i++) {
	    cmdarry.push(s["COMMANDS"][i].CMD_ID);
	  };
	  if(s["COMMANDS"].length > 0){
	    publish_data['commands'] = {};
	    publish_data['commands'][macid] = cmdarry;
	    pub.publish('command-upgrade', JSON.stringify(publish_data));
	  }
	}
	ssid_callback(s,res);
      } else {
	res_data = {};
	publish_data = {};
	var status = false;
	//Check for Upgrade signal on redis
	client.get("UPGRADE_" + macid, function(upgrade_err, upgrade_result){
	  if(upgrade_result == (null || undefined)){
	    //If there is no upgrade then check for commands
	    client.get("CMD_" + macid, function (cmd_err, cmd_result) {	    
	      if(cmd_result == (null || undefined)){
		res.send("{ status : true }");
	      } else {
		console.log(cmd_result);
		res_data["COMMANDS"] = cmd_result;
		res.send("{\"COMMANDS\":" + res_data["COMMANDS"] + "}");
		cmdarry=[];
		cmd_result1 = JSON.parse(cmd_result)	
		for (var i = 0; i < cmd_result1.length ; i++) {
		  cmdarry.push(cmd_result1[i].CMD_ID);
		};
		console.log(macid)
		console.log(JSON.stringify(cmdarry))
		if(cmdarry.length > 0){
		  publish_data['commands'] = {};
		  publish_data['commands'][macid] = cmdarry;
		  pub.publish('command-upgrade', JSON.stringify(publish_data));
		}
	      }
	    });
	  } else {
	    console.log("Upgrade result:" + upgrade_result);
	    res_data["UPGRADE"] = upgrade_result;
	    res.send("{\"UPGRADE\":" + res_data["UPGRADE"] + "}");	    
	    publish_data["upgrade"] = {"mac_id": macid};
	    pub.publish('command-upgrade', JSON.stringify(publish_data));
	  }
	});
      }// sub else ends here     
    } // main else ends here
  }); // client.get macid ends here
}
 

app.post('/heartbeat',  function(req, res){
  var chunks = [];
  req.on('data', function (data) {
    chunks.push(data)
  });
  req.on('end', function(){
    nwurl = Buffer.concat(chunks).toString();
    console.log(new Date());//console.log(nwurl);
    mainfn_call(nwurl,req,res);
  })
});

app.get('/heartbeat',  function(req, res){
  var nwurl = req.param('request')
  mainfn_call(nwurl,req,res); //calling main fn for get
});

app.get('/presence',  function(req, res){
 console.log("horsdsdsdsdsdsdt");
 res.send("e9d2c99175d1dea4b5d966fe4a86c9f5969c5719")
// var hostreq = req.param('request'); //getting from url
// var hostreqparse = JSON.parse(hostreq); //parse it and set to queryparam
// var hostinfo = hostreqparse.INFO; //get info param
// res.send("{ status : true }"); // send status back to browser
// pub.publish('horst', hostinfo); //publish him in a horst chnl
});

app.post('/presence',  function(req, res){ //post method for post
  console.log("presence")
  var chunks = []
  req.on('data', function (data) {
    chunks.push(data)
  });
  req.on('end', function(){
    var hurl = Buffer.concat(chunks).toString();
    console.log(hurl);
    pub.publish('horst', hurl);
    res.send("{ status : true }");
  });
});

app.post('/alerts',  function(req, res){ //post method for post
  console.log("alerts")
  var chunks = []
  req.on('data', function (data) {
    chunks.push(data)
  });
  req.on('end', function(){
    var hurl = Buffer.concat(chunks).toString();
    console.log(hurl);

    pub.publish('command-upgrade', JSON.stringify(JSON.parse(hurl)));
    res.send("{ status : true }");
  });
});

app.get('/commands',  function(req, res){
  console.log("here in commmands");
  pub.publish('commands', JSON.stringify({'00:25:22:2E:D2:41': [1]}));
  res.send("{ status : true }");
})
io.sockets.on('connection', function (socket) {
  socket.on('send', function (data) {
    io.sockets.emit(netid,data);
  });
});

process.on('uncaughtException', function (err) {
  log('error', 'app.js', 'uncaughtException callback', '', 'process.on', err.stack, '');
});

process.on('exit', function () {
  log('debug', 'app.js', 'exit callback', '', 'process.on', 'app exit time ' + new Date(), '');
});

console.log("Listen in 81"); //http
console.log("Listen in 444"); //htttps

