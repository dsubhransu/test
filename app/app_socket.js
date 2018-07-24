var express = require('express');
var config = require('./config.json');
var log = require('./lib/errorLog.js').enterLog;
var url = require('url');
var fs = require('fs');
var base64 = require('base-64');
var querystring = require('querystring');
var util = require('util');
var cluster = require('cluster');
var fpath = '/home/ubuntu/project/pcc-node/public/tcpdump/'
var redis = require("redis");
var redis_ip = '10.178.98.2';
var client = redis.createClient(6379,redis_ip);
var pub = redis.createClient(6379,redis_ip);
var zlib = require('zlib');

var app = express();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

var numCPUs = require('os').cpus().length;

//var privateKey  = fs.readFileSync('./Keys/key.pem');
//var certificate = fs.readFileSync('./Keys/key-cert.pem');
//var credentials = {key: privateKey, cert: certificate};
var http = require('http')
var io = require('socket.io');

// Start the server at port 8080
var server = http.createServer(app)
//server.listen(3000, '192.168.0.24');
//server.listen(3000, '169.254.5.160');

// Create a Socket.IO instance, passing it our server
var socket = io.listen(server);



//var server = require('http').createServer(app);
//var server1 = require('https').createServer(credentials,app);
//var RedisStore = require('socket.io/lib/stores/redis')
var redisSock = require('socket.io-redis')

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
  //var io = require('socket.io').listen(server);

  console.log('server is running');
  console.log("Listen in 80"); //http

 socket.adapter(redisSock({
    host: redis_ip,
    port: 6379
  }))

  /*io.set('store', new RedisStore({
    redisPub : redis.createClient(),
    redisSub : redis.createClient(),
    redisClient : client
  }));*/

  socket.on('connection', function (client) {
   var connection_id = client.id
   //console.log(client.handshake.headers)
   var NASID = client.handshake.headers.nasid
   if(NASID != undefined){
     update_ap_profile(NASID,connection_id,'false')
     console.log('connection_id:'+connection_id+ " "+"and nasid"+NASID)
     //console.log(socket.clients().connected)
      client.on(NASID, function (ap_event) {
          console.log('inside ap_event_response:');
        if(ap_event.TYPE == '0'){
          console.log('inside if condition');
          update_ap_profile(NASID,connection_id,'false')
          check_command_exist(NASID,connection_id)
         }
        else{
            console.log('inside else condition and response data is :');
            console.log(ap_event.DATA);
            if(ap_event.DATA.TYPE == 'pcap_stat'){
               var data = base64.decode(ap_event.DATA.RESP);
               fs.appendFile(fpath+ap_event.DATA.C_ID+'.pcap', data,'binary');
            }
              socket.to(ap_event.DATA.B_ID).emit(ap_event.DATA.B_ID,{STATUS: ap_event.DATA})
        }
      });
      client.on('disconnect', function (data) {
        var NASID = client.handshake.headers.nasid
        console.log('disconnect event calledddddd and disconnected AP:'+NASID);
      });
    }
    else
    {
     client.on('join', function(data){
       console.log(data);
       console.log('i am joined >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>')
       if(typeof(data) == "string"){
          client.join(data);
        }
        else {
          console.log('inside else')
           client.join(data.b_id)
           set_payload(data,'response')
           client.on(data.bid, function (ap_event) {
             console.log("inside browser listen on function")
           });
         }
      })
    }
  });
/*
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
*/

  app.post('/heartbeat', function (req, res) {
    //    console.log(req.headers)
    // If response is gzip, unzip first
    var encoding = req.headers['content-encoding']
    var chunks = [];
    req.on('data', function (data) {
      chunks.push(data);
    });
    req.on('end', function () {
      var nwurl;
      if (encoding && encoding.indexOf('deflate') >= 0) {
        var buffer = Buffer.concat(chunks);
        zlib.inflate(buffer, function (err, dezipped) {
          if (err) {
            console.log(err);
            res.send({
              status: false
            });
          } else {
            var json_string = dezipped.toString('utf-8');
            console.log(json_string);

            mainfn_call(json_string, req, res);
          }
        });
      } else {
        nwurl = Buffer.concat(chunks).toString();
        console.log(nwurl);
        mainfn_call(nwurl, req, res);
      }
    })
  })

  app.get('/heartbeat',  function(req, res){
    console.log('hi')
    var nwurl = req.params('request')
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
      hurl = JSON.parse(hurl)
      console.log(hurl);
      client.hgetall("AP:" + hurl.NASID, function(err, profile) {
        if(profile != (undefined || null)){
          console.log("event log parameters!!!!!!!!!!!!!!!!!!!1")
          console.log(hurl)
          socket.to('lnsocket'+profile.ln_id).emit('event_log_'+profile.ln_id,hurl)
        }
        pub.publish('command-upgrade', pub.rpush('command', JSON.stringify({'ALERT': hurl})));
        res.send("{ status : true }");
       });
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

   app.get('/download_pcap/:fname',function(req,res){
    console.log(req.params);
    res.sendFile(fpath+req.params.fname+'.pcap')
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
var currCh = 1;
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
    static_route_callback(s,res);
  }
      })
  } else {
    //console.log("parsing radio profiles else results ----------------->")
    static_route_callback(s,res);
  }
}

function static_route_callback(s,res){
  var static_routes = s["STATIC_ROUTING_CONFIG"];
  if (static_routes != undefined && static_routes.length >= 1){
    var s_routes = []; var u = 0;
    for (i = 0;i < static_routes.length;i++) {
        console.log("parsing static routes is present ----------------->")
      client.get(static_routes[i], function(sr_err,sr_res){
        if(typeof(sr_res) != (null || undefined)){
          s_routes.push.apply(s_routes, JSON.parse(sr_res));
          u = u + 1;
          if (u == static_routes.length ){
            s["STATIC_ROUTING_CONFIG"] = s_routes;
            send_response_callback(s,res);
          }
        } else {
          res.send({status: true, error: "Not able to get static route config"});
        }
      })
    }
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
  //pub.publish('bravo1', pub.rpush('bravo', nwurl)); //publishing to bravo channel using redis
  console.log('inside main function');
  /*!!!!!! UNCOMMENT !!!!!!! below block if you are using rounrobin publish*/
  if(currCh == 4)
    currCh = 1;
  pub.publish('bravo' + currCh.toString(), pub.rpush('bravo', nwurl)); //publishing to bravo channel using redis
  currCh += 1;
  

  //redis part (getting details based on macid)
  client.get(macid, function (err, result) {
    if (err || result == (undefined || null)){ //main if
	console.log("[REDIS][" + macid + "] Device config is not found or redis error!!");
	console.log(err);
	console.log(result);
	res.send("{ status : true }");
      /*client.get("default", function(err1,result1){
  var def = JSON.parse(result1);
  cons_id = def.BASIC_CONFIG.CONSUME_ID;
  if(cons_id == CONSUME_ID){
    res.send("{ status : true }");
  } else {
    res.send(result1);
  }
      });*/
    } else { //main else
      s = JSON.parse(result); //parse the result to convert to json
      //getting consume-id,ssid from url result after parsing it
      cons_id = s.BASIC_CONFIG.CONSUME_ID;
      netid = s["NETWORK_ID"];
      if(netid == undefined){
        netid = "news";
      }
      //Emit to particular Network and device.
      socket.in(netid).emit(netid, nwurl)
      socket.in(macid).emit(macid, nwurl)
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
  client.hgetall("AP:" + macid, function(err, profile) {
    sock_con = {}
    if(profile != (undefined || null)){
      var con_req = profile.CON_REQ == 'false' ? '0' : '1';
      var port = req.headers.host.split(':')[1]
      sock_con = {'SOCKET_IO_HOSTNAME': req.headers.host.split(':')[0],'SOCKET_IO_PORT': port == undefined ? '80' : port,'ENABLE': con_req};
    }
    else
        console.log('Profile empty');
        console.log("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBb: ")
        console.log(sock_con)
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
      if(reply == (null || undefined)){
           res.send("{ \"SOCKET_IO\" :"+ JSON.stringify(sock_con) + "}");
      }
      else{
      client.del('logout_'+ macid);
      var cmds = [];//JSON.parse(res_data["COMMANDS"]);
      console.log(reply);

      for(var v in reply){
        console.log(JSON.parse(reply[v]));
        cmds.push(JSON.parse(reply[v]));
      }
      if(cmds.length > 0){
       data = {'COMMANDS': cmds,'SOCKET_IO': sock_con}
        console.log(data)
        res.send(JSON.stringify(data));
      }
      else
        res.send("{ \"SOCKET_IO\" :"+ JSON.stringify(sock_con) + "}");
      }
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
      if(cmds.length > 0){
        data = {'COMMANDS': cmds,'SOCKET_IO': sock_con}
        console.log(data)
        res.send(JSON.stringify(data));
      }
      else
        res.send("{ \"SOCKET_IO\" :"+ JSON.stringify(sock_con) + "}");

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
    });//get ap profile end
      }// sub else ends here
    } // main else ends here
  }); // client.get macid ends here
}

function set_redis_logout(data){
  console.log("inside function");
  //var cmd = "chilli_query logout mac " + data.USER_MAC ;
  var cmd = "chilli_query -s /var/run/chilli.sock_ra0 logout mac " + data.USER_MAC ;
  if (data.SCRIPT != undefined && data.SCRIPT != ''){
    cmd = "/bin/piap_upd -L -m " + data.USER_MAC ;
  }

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

function set_payload(data,res){
  console.log("here in set_payload method");
  var cmd = data.cmd;
  //var new_cmd = { ID: parseInt(data.ping_id),CMD: cmd,STATUS: 1,TIMEOUT: 0 ,TYPE: parseInt(data.type)};
  var new_cmd = { B_ID: data.b_id,C_ID: data.c_id,CMD: cmd,STATUS: parseInt(data.status),TIMEOUT: 0 ,TYPE: data.type};
  client.lrange("ap_diagnostic_" + data.mac_id, 0, -1, function(err, reply) {
     console.log("inside lrange"+reply);
    if(Object.keys(reply).length != 0){
      client.del("ap_diagnostic_"+ data.mac_id, 0, -1)
      console.log("inside lrange if");
      for(var v in reply){
        console.log(reply[v]);
        pub.rpush('ap_diagnostic_'+ data.mac_id, reply[v]);
      }
      console.log(client.lrange("ap_diagnostic_" + data.mac_id, 0, -1))
    }
    console.log("push redis completed")
    pub.rpush('ap_diagnostic_'+ data.mac_id, JSON.stringify(new_cmd));
    check_connection_browser(data.mac_id,res,false)
  });
}

//function to check whether connectin exist from node to ap
function check_connection(mac,res){
  console.log("here in  check connection method:"+mac);
  var status = false;
  //check whether the port is opened
  // if port is opened dont add response in heartbeat to open new port
  client.hgetall("AP:" + mac, function(err, profile) {
    if(profile != (undefined || null)){
      var channel = profile.SOCKET_ID
      var connection_status = false
      console.log("socket data:"+socket);
      for(var v in socket.clients().sockets){
        console.log('channel_id: '+channel+ " connected_socket: "+v)
       if(channel.toString() == v.toString())
         connection_status = true

      }
        if(profile.CON_REQ == 'true'){
          pub.hset('AP:'+ mac, 'CON_REQ','false');
          status =  true
        }
        else{
          status =  false
           pub.hset('AP:'+ mac, 'SOCKET_ID','');
           pub.hset('AP:'+ mac, 'CON_REQ','true');

        }
      }
    else{
      status =  false
      pub.hset('AP:'+ mac, 'SOCKET_ID','');
      pub.hset('AP:'+ mac, 'CON_REQ','true');
    }
    console.log("status end")
    if(status && connection_status){
         socket.to(channel).emit(channel, {"status":'1'})
         check_command_exist(mac,channel)
         //res.send({"RESPONSE":'true connection status is true'});
    }
    else{
          var data = {'URL':'pcc.wavespot.net','PORT':'8888'};
          update_ap_profile(NASID,connection_id,'true');
          //res.send({"RESPONSE":data});
    }
       //res.send("{ status : true }");
  });
}

function check_connection_browser(mac,res){
  console.log("here in  check connection_browser method:"+mac);
  var status = false;
  //check whether the port is opened
  // if port is opened dont add response in heartbeat to open new port
  client.hgetall("AP:" + mac, function(err, profile) {
    if(profile != (undefined || null)){
      status = true;
      var channel = profile.SOCKET_ID
      var connection_status = false
      console.log('channel_id: '+channel)
      console.log(socket.clients().connected)
      for(var v in socket.clients().sockets){
        console.log('channel_id: '+channel+ " connected_socket: "+v)
       if(channel != undefined && channel.toString() == v.toString())
       connection_status = true
      }
    }
    else
      console.log("status empty and profile is:"+profile)
    console.log("status"+status+' '+"connectiotatus:"+connection_status)
    // if(status && connection_status)
    // if(true)
     // {
         // socket.to(channel).emit(channel, {"status":'1'})
         // check_command_exist(mac,channel)
         // res.send({"RESPONSE":'true connection status is true'});
    // }
    // else{
          // res.send({"RESPONSE":'false connection does not exist'});
          // update_ap_profile(mac,'','true');
          // console.log('updating connection request inside profile to true since connection doesnt exist')
          // socket.to(channel).emit(channel, {'status':'1'})
    // }
       //res.send("{ status : true }");
       socket.to(channel).emit(channel, {"TYPE":'0'});
       update_ap_profile(mac,'','true');

  });
}

// store in redis if connection doesnt not exist between ap and node
function update_ap_profile(mac,connection_id,status){
  console.log("here in  update_ap_profile"+mac+ " "+connection_id);
  client.hgetall("AP:" + mac, function(err, reply) {
    if(reply != (null || undefined)){
      pub.hset('AP:'+ mac, 'SOCKET_ID',connection_id);
      pub.hset('AP:'+ mac, 'CON_REQ',status);
      //check_command_exist(mac,connection_id)
    }
    else{
    console.log('inside else condition')
    //check_command_exist(mac,connection_id)
    }
  });
}

 function check_command_exist(macid,channel){
  // client.get("UPGRADE_" + macid, function(upgrade_err, upgrade_result){
    // if(upgrade_result != (null || undefined)){
      // client.del('UPGRADE_'+ macid);
      // send_redis_data(upgrade_result,"UPGRADE",macid,channel)
    // }
    // client.get("CMD_" + macid, function (cmd_err, cmd_result) {
      // if(cmd_result != (null || undefined)){
        // client.del('CMD_'+ macid);
        // send_redis_data(cmd_result,"COMMAND",macid,channel)
      // }
      // client.lrange('logout_'+ macid, 0, -1, function(err, reply) {
        // if(reply != (null || undefined)){
          // client.del('logout_'+ macid);
          // send_redis_data(reply,"LOGOUT",macid,channel)
        // }
         client.lrange('ap_diagnostic_'+ macid, 0, -1, function(err, cmds) {
           //actually getrange is working and lrange is not working confirm with arun
           if(cmds != (null || undefined)){
              client.del('ap_diagnostic_'+ macid);
              send_redis_data(cmds,2,macid,channel)
           }
         });
      //});
    //});
  //});
}

function send_redis_data(data,type,mac,channel){
  console.log("data is:"+data+" "+"TYPE:"+type.toString()+" "+'channel:'+channel)
   for(var v in data){
       var json = {"ID":mac,"TYPE": type.toString(),'DATA': [JSON.parse(data[v])]}
      console.log(json);
      socket.to(channel).emit(channel, json)
    }
}

