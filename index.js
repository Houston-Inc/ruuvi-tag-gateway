const net = require("net");
const events = require("events");

const mqtt = require("azure-iot-device-mqtt").Mqtt;
const deviceClient = require("azure-iot-device").Client;
const message = require("azure-iot-device").Message;
const { EventHubClient, EventPosition } = require("@azure/event-hubs");

var {edgeDeviceConnectionString, c2DConnectionString} = require("./connection-strings.json");

const client = deviceClient.fromConnectionString(edgeDeviceConnectionString, mqtt);
const currentEdgeDeviceId = process.env.EDGEDEVICEID;

let ruuvitags = [];
let devices = [];
/**
 * {
 *  device: ...
 *  numOfRetire: 1-...
 * }
 */
/*
{
    address: ""
    uuid: LATER
    status: enum(REGISTERED, WAITING, DENIED, ERROR)
    telemetry: {}
    deviceTwin : {}
}
*/
const printResultFor = op => {
    return (err, res) => {
        if (err) console.log(op + " error: " + err.toString());
        if (res) console.log(op + " status: " + res.constructor.name);
    };
}


const printError = err => {
    console.log(err.message);
};


/**
 * 
 * 
 * var events = require('events');

function Updater(time) {
    this.time = time;
    this.array = [
        {number: 1},
        {number: 2}
    ];
    var that;
    events.EventEmitter.call(this);

    this.init = function()
    {
        that = this;
        console.log("Contructor");
        //Start interval
        setInterval(that.run,that.time);
    };

    this.run = function()
    {
        that.array.forEach(function (item) {
           if(item.number === 2)
           {
               that.emit('Event');
           }
        });
    };
}

Updater.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = Updater;

server.js:

var Updater = require('./UpdaterEvent');

var u = new Updater(10000);
u.init();
u.on('Event',function () {
   console.log("Event catched!");
});
 */
const handleMessage = iotHubMsg => {
    const attemptedDeviceRegistration = iotHubMsg.applicationProperties.type === 'DeviceRegistrationAttempted';
    console.log('handleMessage attemptedDeviceRegistration', attemptedDeviceRegistration);
    const { edgeDeviceId, deviceTwin, wasSuccessful, message, registrationId } = iotHubMsg.body;

    if (attemptedDeviceRegistration && edgeDeviceId === currentEdgeDeviceId) {
        devices.forEach(device => {
            device.numberOfRetries = device.numberOfRetries + 1;
            if (device.address === registrationId) {
                if (wasSuccessful) {
                    device.status = "REGISTERED";
                    device.deviceTwin = deviceTwin;
                } else {
                    if (message === "Device already exists") {
                        device.status = "DENIED";
                    } else {
                        device.status = "ERROR";
                    }
                }
            }

        });
    }
};



let ehClient;
EventHubClient.createFromIotHubConnectionString(c2DConnectionString)
    .then(client => {
        console.log("Successfully created the EventHub Client from iothub connection string.");
        ehClient = client;
        return ehClient.getPartitionIds();
    })
    .then(ids => {
        console.log("The partition ids are: ", ids);
        return ids.map(id => {
            return ehClient.receive(id, handleMessage, printError, {
                eventPosition: EventPosition.fromEnqueuedTime(Date.now())
            });
        });
    })
    .catch(printError);


const unixServer = net.createServer(socket => {
    socket.on("data", function(data) {
        let telemetry;
        try {
            telemetry= JSON.parse(data.toString());
        } catch (ex) {
            return;
        }
        const obj = {
            address: telemetry.device.address,
            temperature: telemetry.sensors.temperature,
            humidity: telemetry.sensors.humidity,
            pressure: telemetry.sensors.pressure,
            time: new Date().toISOString()
        };
        const alreadyDiscoveredDevice = devices.find(a => a.address === obj.address);
        //console.log('DEVICES !!! ', devices);
        //console.log('alreadyDiscoveredDevice ****!!!**** ', alreadyDiscoveredDevice);
        const deviceRegistrationObj = {
            edgeDeviceId: currentEdgeDeviceId,
            address: telemetry.device.address
        };
        if(!alreadyDiscoveredDevice) {
            //console.log('IS IT REGISTRING AGAIN AND AGAIN');
            
            const device = {
                status: 'WAITING',
                address: telemetry.device.address,
                countDownToRetry : 6,   
            }
            devices.push(device);

            // for the device we have to wait 15 seconds to see the status and if its WAITING then RETRY
            registrationRequestRetry(deviceRegistrationObj);
            
        }

        if(alreadyDiscoveredDevice && alreadyDiscoveredDevice.status === "WAITING") {
            
            console.log('in the fix for WAITING devices');
            devices = devices.reduce((acc ,curr) => {
                if(curr === alreadyDiscoveredDevice) {
                    console.log('Count down ', curr.countDownToRetry);
                    curr.countDownToRetry = curr.countDownToRetry - 1;
                }
                if(curr.countDownToRetry === 0) {
                    console.log('Count down is ZERO. Lets try registring');
                    registrationRequestRetry(deviceRegistrationObj);
                    curr.countDownToRetry = 6;
                }
                acc.push(curr);
                return acc;
            }, []);
            console.log('DEVICES ARRAY ', devices);
        }

        if(alreadyDiscoveredDevice && alreadyDiscoveredDevice.status === "REGISTERED") {
            const data = JSON.stringify(obj);
            const msg = new message(data);
            msg.properties.add("type", "telemetry");
            client.sendEvent(msg, printResultFor("send"));
            
        }
    });
});


const registrationRequestRetry = (deviceRegistrationObj) => {
    const data = JSON.stringify(deviceRegistrationObj);
    const msg = new message(data);
    msg.properties.add("type", "device-registration");
    client.sendEvent(msg, printResultFor("send"));
} 

/*
setInterval(() => {
    if(ruuvitags.length === 0) return;

    // console.clear();
    // console.log("current time:", "\t", new Date().toISOString(), "\n");
    // console.log(ruuvitags);
    
    const data = JSON.stringify(ruuvitags);
    const msg = new message(data);
    msg.properties.add("type", "telemetry");
    client.sendEvent(msg, printResultFor("send"));
    
}, 3000);
*/

setInterval(()=> {
    console.clear();
    console.log(new Date())
    console.log(devices);
}, 1000)

unixServer.listen(process.env.SOCKETPATH);
