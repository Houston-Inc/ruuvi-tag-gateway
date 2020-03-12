const net = require("net");
const crypto = require("crypto");

const mqtt = require("azure-iot-device-mqtt").Mqtt;
const deviceClient = require("azure-iot-device").Client;
const message = require("azure-iot-device").Message;
const { EventHubClient, EventPosition } = require("@azure/event-hubs");

var {edgeDeviceConnectionString, c2DConnectionString, primaryKey, iotHub} = require("./connection-strings.json");

const client = deviceClient.fromConnectionString(edgeDeviceConnectionString, mqtt);
const currentEdgeDeviceId = process.env.EDGEDEVICEID;

let ruuvitags = [];
let devices = [];
// TODO: LIST OF DEVICES TO BE REGISTERED
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

const handleMessage = iotHubMsg => {
    const attemptedDeviceRegistration = iotHubMsg.applicationProperties.type === 'DeviceRegistrationAttempted';
    //console.log('handleMessage attemptedDeviceRegistration', attemptedDeviceRegistration);
    const { edgeDeviceId, deviceTwin, wasSuccessful, message, registrationId } = iotHubMsg.body;

    console.log("\n HANDLE MESSAGE")
    console.log("registrationId",registrationId);
    console.log("edgeDeviceId",edgeDeviceId);
    console.log("deviceTwin",deviceTwin);
    console.log("first if: " + (attemptedDeviceRegistration && edgeDeviceId === currentEdgeDeviceId));
    console.log("wasSuccessful", wasSuccessful);


    if (attemptedDeviceRegistration && edgeDeviceId === currentEdgeDeviceId) {
        devices.forEach(device => {
            if (device.address === registrationId) {
                console.log("IT WAS TRUE");
                if (wasSuccessful && (device.status === "WAITING" || device.status === "DENIED")) {
                    console.log("first twin", device.deviceTwin);
                    device.status = "REGISTERED";
                    device.timeToRetry = null;
                    device.deviceTwin = deviceTwin;
                    device.deviceTwin.edgeDeviceId = currentEdgeDeviceId;
                    console.log("second twin", device.deviceTwin);
                    openDeviceTwinConnection(registrationId, device.deviceTwin);
                } else {
                    const timeToRetry = new Date();
                    timeToRetry.setHours(timeToRetry.getHours() + 1);
                    device.timeToRetry = timeToRetry;
                    device.status = "DENIED";                    
                }
            }

        });
    }
};

const openDeviceTwinConnection = (registrationId, deviceTwin) => {
    const symmetricKey = crypto
        .createHmac("SHA256", Buffer.from(primaryKey, "base64"))
        .update(registrationId, "utf8")
        .digest("base64");

    const connectionString =
        "HostName=" + iotHub + ";DeviceId=" + registrationId + ";SharedAccessKey=" + symmetricKey;

    const hubClient = deviceClient.fromConnectionString(connectionString, mqtt);
    hubClient.open(err => {
        if (err) {
            console.log("error setting up device twin: ", err)
        } else {
            // DEVICE TWIN
            hubClient.getTwin((err, twin) => {
                if (err) {
                    console.error("error getting twin: " + err);
                }

                twin.on("properties.desired", desired => {
                    //console.log("new desired properties received:");
                    //console.log(desired);
                    
                    let updatedDeviceTwin;
                    devices.map(d => {
                        if(d.address === registrationId) {
                            d.deviceTwin = desired;
                            if(desired.edgeDeviceId === "INITIAL") {
                                d.deviceTwin.edgeDeviceId = currentEdgeDeviceId;
                            }
                            updatedDeviceTwin = d.deviceTwin;
                        }
                        return d;
                    });
                    const report = {"edgeDeviceId": updatedDeviceTwin.edgeDeviceId}

                    sendUpdateToDatabase(registrationId, updatedDeviceTwin.edgeDeviceId);

                    twin.properties.reported.update(report, (err) => {
                        if (err) throw err;
                        console.log("twin state reported: ", report);
                    });
                });


                const report = {"edgeDeviceId": deviceTwin.edgeDeviceId}
                twin.properties.reported.update(report, (err) => {
                    if (err) throw err;
                    console.log("twin state reported");
                });
            });
        }
    });
};

/**
 * const data = JSON.stringify(deviceRegistrationObj);
    const msg = new message(data);
    msg.properties.add("type", "device-registration");
    client.sendEvent(msg, printResultFor("send"));
 */

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
       // console.log('Telemetry ',  JSON.parse(data.toString()));
        
        let telemetry;
        try {
            telemetry= JSON.parse(data.toString());
        } catch (ex) {
            return;
        }

        const obj = {
            address: telemetry.device.address,
            rssi: telemetry.rssi,
            temperature: telemetry.sensors.temperature,
            humidity: telemetry.sensors.humidity,
            pressure: telemetry.sensors.pressure,
            voltage: telemetry.sensors.voltage,
            txpower: telemetry.sensors.txpower,
            time: new Date().toISOString()
        };

        const alreadyDiscoveredDevice = devices.find(a => a.address === obj.address);
         const deviceRegistrationObj = {
            edgeDeviceId: currentEdgeDeviceId,
            address: telemetry.device.address
        };
        if(!alreadyDiscoveredDevice) {            
            const timeToRetry = new Date();
            timeToRetry.setSeconds(timeToRetry.getSeconds() + 15);
            const device = {
                status: 'WAITING',
                address: telemetry.device.address,
                timeToRetry: timeToRetry,
                deviceTwin: {},
            }
            devices.push(device);
            // for the device we have to wait 15 seconds to see the status and if its WAITING then RETRY
            sendRegistrationRequest(deviceRegistrationObj);
        }
        
        if(alreadyDiscoveredDevice && (alreadyDiscoveredDevice.status === "WAITING" || alreadyDiscoveredDevice.status === "DENIED" )) {
            
            devices = devices.reduce((acc ,curr) => {
                const date = new Date()
                if(curr === alreadyDiscoveredDevice && date > curr.timeToRetry) {
                    sendRegistrationRequest(deviceRegistrationObj);
                    if (alreadyDiscoveredDevice.status === "WAITING") {
                        date.setSeconds(date.getSeconds() + 15);
                    } else {
                        date.setHours(date.getHours() + 1);
                    }
                    curr.timeToRetry = date;
                }
                acc.push(curr);
                return acc;
            }, []);
            //console.log('DEVICES ARRAY ', devices);
        }
        //console.log('ALREADY ', alreadyDiscoveredDevice);
        alreadyDiscoveredDevice && console.log("alreadyDiscoveredDevice.deviceTwin", alreadyDiscoveredDevice.deviceTwin)

        if(alreadyDiscoveredDevice && alreadyDiscoveredDevice.deviceTwin.edgeDeviceId === currentEdgeDeviceId) {
            const data = JSON.stringify(obj);
            const msg = new message(data);
            msg.properties.add("type", "telemetry");
            client.sendEvent(msg, printResultFor("send"));
        }
    });
});


const sendRegistrationRequest = (deviceRegistrationObj) => {
    const data = JSON.stringify(deviceRegistrationObj);
    const msg = new message(data);
    msg.properties.add("type", "device-registration");
    client.sendEvent(msg, printResultFor("send"));
}

const sendUpdateToDatabase = (registrationId, edgeDeviceId) => {
    const ids = {registrationId, edgeDeviceId}
    const data = JSON.stringify(ids);
    const msg = new message(data);
    msg.properties.add("type", "device-update");
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
     // console.clear();
     console.log(new Date())
     console.log(devices);
 }, 1000)

unixServer.listen(process.env.SOCKETPATH);
