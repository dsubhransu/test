var express = require('express');
var config = require('./config.json');
var log = require('./lib/errorLog.js').enterLog;
var url = require('url');
var fs = require('fs');
var querystring = require('querystring');
var util = require('util');
var cluster = require('cluster');

var redis = require("redis")
var client = redis.createClient();
var pub = redis.createClient();

var app = express();
var numCPUs = require('os').cpus().length;

//var privateKey  = fs.readFileSync('./Keys/key.pem');
//var certificate = fs.readFileSync('./Keys/key-cert.pem');
//var credentials = {key: privateKey, cert: certificate};

var server = require('http').createServer(app);
//var server1 = require('https').createServer(credentials,app);
var RedisStore = require('socket.io-redis')

//Cluster options
if (cluster.isMaster) {
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  Object.keys(cluster.workers).forEach(function(id) {
    console.log(cluster.workers[id].process.pid);
  });
} else {
  // Set server port
  server.listen(8080); //http
  //server1.listen(3333); //https
  var io = require('socket.io').listen(server);

  console.log('server is running');
  console.log("Listen in 80"); //http

  io.set('store', new RedisStore({
    redisPub : redis.createClient(),
    redisSub : redis.createClient(),
    redisClient : client
  }));

  io.sockets.on('connection', function (socket) {
    socket.on('join', function (data) {
      console.log("Client connected to room: " + data);
      socket.join(data);
    });
  });

  app.post('/heartbeat',  function(req, res){
    var chunks = [];
    req.on('data', function (data) {
      chunks.push(data)
    });
    req.on('end', function(){
      nwurl = Buffer.concat(chunks).toString();
      console.log(nwurl);
      mainfn_call(nwurl,req,res);
    })
  });

  app.get('/heartbeat',  function(req, res){
    var nwurl = req.param('request')
    mainfn_call(nwurl,req,res); //calling main fn for get
  });

  app.get('/presence',  function(req, res){
   console.log("horsdsdsdsdsdsdt");
   //res.send("e9d2c99175d1dea4b5d966fe4a86c9f5969c5719");
   //res.send("23ca9795b0f4fb0b627ce7c4dce1f492efe36b1f"); telstra meraki
   res.send("45796e0c9661f6887a21cdf7c228fd25cfd96be6")
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
      pub.publish('horst', pub.rpush('presence', hurl));
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

      pub.publish('command-upgrade', pub.rpush('command', JSON.stringify({'ALERT': JSON.parse(hurl)})));
      res.send("{ status : true }");
    });
  });

  app.get('/commands',  function(req, res){
    console.log("here in commmands");
    pub.publish('commands', JSON.stringify({'00:25:22:2E:D2:41': [1]}));
    res.send("{ status : true }");
  })

  app.get('/piap/session_logout',  function(req, res){
    console.log("here in session_logout get method");
    var data = req.query
    if (data.AP_MAC != undefined && data.AP_MAC != '' && data.USER_MAC != undefined && data.USER_MAC != ''){
      set_redis_logout(data)
      res.send("{ status : true }");
    }
    else
      res.send("{ status : Data Insufficient}");
  })


  app.post('/piap/session_logout',  function(req, res){
    console.log("here in session_logout post method");
    var data = req.query
    if (data.AP_MAC != undefined && data.AP_MAC != '' && data.USER_MAC != undefined && data.USER_MAC != ''){
      set_redis_logout(data)
      res.send("{ status : true }");
    }
    else
      res.send("{ status : Data Insufficient}");
  })

}

// Listen for dying workers
cluster.on('exit', function (worker) {
    // Replace the dead worker,
    console.log('Worker ' + worker.id + ' died :(');
    cluster.fork();
});

client.on("error", function (err) {
  console.log("error event - " + client.host + ":" + client.port + " - " + err);
});

//client.hset("defaultkey","default",'hello',redis.print);

var netid;
/*!!!!!! UNCOMMENT !!!!! below line if you are using round robin publish */
//var currCh = 1;
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
  ssid_res = s["SSID_CONFIG"];
  console.log("Set SSID Config")
  var ssids = []; var u=0;
  console.log(ssid_res)
  if (ssid_res != undefined && ssid_res.length >= 1){
    //console.log("parsing ssid results ----------------->")
    for (i in ssid_res) {
      client.get(ssid_res[i], function(ssid_res_err,ssid_result){
	if(ssid_result != null || ssid_result != undefined){
	  ssids.push(JSON.parse(ssid_result))
	}
	u = u + 1;
	if (u == ssid_res.length){
	  s["SSID_CONFIG"] = ssids;
	  acl_callback(s,res)
	}
      });
    }
  } else {
    acl_callback(s,res);
  }
}

function acl_callback(s,res){
  var acl = s["ACL_CONFIG"];
  if (acl!= undefined && acl.length >=1){
    var acls = []; var u = 0;
    for (i = 0;i < acl.length;i++) {
      client.get(acl[i], function(acl_err,acl_result){
	if(acl_result != (null || undefined)){
	  //console.log("parsing acl results ----------------->")
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
    //console.log("parsing vlan is present ----------------->")
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
    //console.log("parsing vlan else results ----------------->")
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
	       radio_profile_callback(s,res);
	    }
	  }
        })
      }
      //console.log("parsing port results ----------------->")
  } else {
    //console.log("parsing port else results ----------------->")
    radio_profile_callback(s,res);
  }
}

function radio_profile_callback(s,res){
  var radio_profiles = s["RADIO_PROFILES"];
  if (radio_profiles != undefined && radio_profiles.length >= 1){
    //console.log("parsing radio profiles is present ----------------->")
    var radios = []; var u = 0;
    for (i = 0;i < radio_profiles.length;i++) {
      client.get(radio_profiles[i], function(radio_err,radio_res){
	if(typeof(radio_res) != (null || undefined)){
	  radios.push(JSON.parse(radio_res));
	  u = u + 1;
	  if (u == radio_profiles.length ){
	    s["RADIO_PROFILES"] = radios;
	    wired_config_callback(s,res);
	  }
	}
      })
    }
  } else {
    //console.log("parsing radio profiles else results ----------------->")
    wired_config_callback(s,res);
  }
}

function wired_config_callback(s,res){
  var wired_config = s["WIRED_CONFIG"];
  if (wired_config != undefined && wired_config != ""){
    //console.log("parsing radio profiles is present ----------------->")
      client.get(wired_config, function(wc_err,wc_res){
	if(typeof(wc_res) != (null || undefined)){
	  s["WIRED_CONFIG"] = JSON.parse(wc_res);
	  send_response_callback(s,res);
	}
      })
  } else {
    //console.log("parsing radio profiles else results ----------------->")
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
  pub.publish('bravo1', pub.rpush('bravo', nwurl)); //publishing to bravo channel using redis

  /*!!!!!! UNCOMMENT !!!!!!! below block if you are using rounrobin publish*/
  /*if(currCh == 4)
    currCh = 1;
  pub.publish('bravo' + currCh.toString(), pub.rpush('bravo', nwurl)); //publishing to bravo channel using redis
  currCh += 1;
  */

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
      //Emit to particular Network and device.
      io.sockets.to(netid).emit(netid, nwurl)
      io.sockets.to(macid).emit(macid, nwurl)
      //io.sockets.emit(netid,nwurl);

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
	    pub.publish('command-upgrade', pub.rpush('command', JSON.stringify(publish_data)));
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
		client.lrange('logout_'+ macid, 0, -1, function(err, reply) {
		  client.del('logout_'+ macid);
		  var cmds = [];//JSON.parse(res_data["COMMANDS"]);
		  console.log(reply);
		  for(var v in reply){
		    console.log(JSON.parse(reply[v]));
		    cmds.push(JSON.parse(reply[v]));
		  }
		  if(cmds.length > 0)
		    res.send("{\"COMMANDS\":" + JSON.stringify(cmds) + "}");
		  else
		    res.send("{ status : true }");
		});
	      } else {
		console.log(cmd_result);
		res_data["COMMANDS"] = cmd_result;
		client.lrange('logout_'+ macid, 0, -1, function(err, reply) {
		  client.del('logout_'+ macid);
		  var cmds = JSON.parse(res_data["COMMANDS"]);
		  console.log(reply);
		  for(var v in reply){
		    console.log(JSON.parse(reply[v]));
		    cmds.push(JSON.parse(reply[v]));
		  }

		  if(cmds.length > 0)
		    res.send("{\"COMMANDS\":" + JSON.stringify(cmds) + "}");
		  else
		    res.send("{ status : true }");

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
		    pub.publish('command-upgrade', pub.rpush('command', JSON.stringify(publish_data)));
		  }
		});
	      }
	    });
	  } else {
	    console.log("Upgrade result:" + upgrade_result);
	    res_data["UPGRADE"] = upgrade_result;
	    res.send("{\"UPGRADE\":" + res_data["UPGRADE"] + "}");
	    publish_data["upgrade"] = {"mac_id": macid};
	    pub.publish('command-upgrade', pub.rpush('command', JSON.stringify(publish_data)));
	  }
	});
      }// sub else ends here
    } // main else ends here
  }); // client.get macid ends here
}

function set_redis_logout(data){
  console.log("inside function");
  //var cmd = "chilli_query logout mac " + data.USER_MAC ;
  var cmd = "chilli_query -s /var/run/chilli.sock_ra0 logout mac " + data.USER_MAC ;
  var date = Date.now();
  var redis_data = { CMD_ID: date,CMD: cmd };
  console.log(cmd);
  //pub.rpush('logout_'+ data.AP_MAC, JSON.stringify(redis_data));
  pub.rpush('logout_'+ data.AP_MAC.replace(new RegExp('-', 'g'), ':'), JSON.stringify(redis_data));
}
process.on('uncaughtException', function (err) {
  log('error', 'app.js', 'uncaughtException callback', '', 'process.on', err.stack, '');
});

process.on('exit', function () {
  log('debug', 'app.js', 'exit callback', '', 'process.on', 'app exit time ' + new Date(), '');
});

