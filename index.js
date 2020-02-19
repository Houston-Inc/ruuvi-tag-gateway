const net = require("net");
const mqtt = require("azure-iot-device-mqtt").Mqtt;
const deviceClient = require("azure-iot-device").Client;
const message = require("azure-iot-device").Message;
const { EventHubClient, EventPosition } = require("@azure/event-hubs");

var {edgeDeviceConnectionString, c2DConnectionString} = require("./connection-strings.json");

const client = deviceClient.fromConnectionString(edgeDeviceConnectionString, mqtt);
const currentEdgeDeviceId = process.env.EDGEDEVICEID;

let ruuvitags = [];
let devices = [];

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

const handleMessage = iotHubMsg => {
    const attemptedDeviceRegistration = iotHubMsg.applicationProperties.type === 'DeviceRegistrationAttempted';
    const { edgeDeviceId, deviceTwin, wasSuccessful, message, registrationId } = iotHubMsg.body;

    if (attemptedDeviceRegistration && edgeDeviceId === currentEdgeDeviceId) {
        devices.forEach(device => {

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
        let telemetry = JSON.parse(data.toString());
        const obj = {
            address: telemetry.device.address,
            temperature: telemetry.sensors.temperature,
            humidity: telemetry.sensors.humidity,
            pressure: telemetry.sensors.pressure,
            time: new Date().toISOString()
        };
        const isDeviceRegistered = devices.find(a => a.address === obj.address);
        if(!isDeviceRegistered) {
            const deviceRegistrationObj = {
                edgeDeviceId: currentEdgeDeviceId,
                address: telemetry.device.address
            };
            devices.push({
                status: 'WAITING',
                address: telemetry.device.address,   
            })
            const data = JSON.stringify(deviceRegistrationObj);
            const msg = new message(data);
            msg.properties.add("type", "device-registration");
            client.sendEvent(msg, printResultFor("send"));
        }
    });
});

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
