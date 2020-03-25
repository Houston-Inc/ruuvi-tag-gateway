'use strict';

const mqtt = require('azure-iot-device-mqtt').Mqtt;
const ModuleClient = require('azure-iot-device').ModuleClient;
const DeviceClient = require("azure-iot-device").Client;
const Message = require('azure-iot-device').Message;
const net = require('net');
const fs = require('fs');
const crypto = require('crypto');

const currentEdgeDeviceId = process.env.EDGE_DEVICE_ID;
const primaryKey = process.env.PRIMARY_KEY;
const iotHub = process.env.IOT_HUB;

const devices = [];

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

let moduleClient;
ModuleClient.fromEnvironment(mqtt, function (err, client) {
  if (err) {
    throw err;
  } else {
  
    client.on('error', function (err) {
      throw err;
    });

    client.onMethod('DeviceRegistrationAttempted', function(request, response) {
        console.log('DeviceRegistrationAttempted method called', request);
        handleDeviceRegistrationMessage(request.payload);
        response.send(200, "", function(err) {
            if (err) {
                console.log('Error sending response to DeviceRegistrationAttempted method', err);
            } else {
                console.log('Response to DeviceRegistrationAttempted method sent successfully.');
            }
        });
    });

    client.open(function (err) {
      if (err) {
          throw err;
      } else {
          console.log('IoT Hub module client initialized');
          moduleClient = client;
          createUnixServer();
      }
    });
  }
});

const handleDeviceRegistrationMessage = iotHubMsg => {
    const { edgeDeviceId, deviceTwin, wasSuccessful, registrationId } = iotHubMsg;

    console.log("\n HANDLE MESSAGE")
    console.log("registrationId", registrationId);
    console.log("edgeDeviceId", edgeDeviceId);
    console.log("deviceTwin", deviceTwin);
    console.log("wasSuccessful", wasSuccessful);

    const device = devices.find((d) => { return d.address === registrationId });
    if (wasSuccessful && (device.status === "WAITING" || device.status === "DENIED")) {
        device.status = "REGISTERED";
        device.timeToRetry = null;
        device.deviceTwin = deviceTwin;
        device.deviceTwin.edgeDeviceId = currentEdgeDeviceId;
        openDeviceTwinConnection(registrationId, deviceTwin);
    } else {
        const timeToRetry = new Date();
        timeToRetry.setHours(timeToRetry.getHours() + 1);
        device.timeToRetry = timeToRetry;
        device.status = "DENIED";
    }
};

const openDeviceTwinConnection = (registrationId, deviceTwin) => {
    console.log("Open device twin connection");
    const symmetricKey = crypto
        .createHmac("SHA256", Buffer.from(primaryKey, "base64"))
        .update(registrationId, "utf8")
        .digest("base64");
    
    const connectionString =
        "HostName=" + iotHub + ";DeviceId=" + registrationId + ";SharedAccessKey=" + symmetricKey;

    const deviceClient = DeviceClient.fromConnectionString(connectionString, mqtt);
    deviceClient.open(err => {
        if (err) {
            console.log("error setting up device twin: ", err)
        } else {
            // DEVICE TWIN
            deviceClient.getTwin((err, twin) => {
                if (err) {
                    console.error("error getting twin: " + err);
                }

                twin.on("properties.desired", desired => {
                    //console.log("new desired properties received:");
                    //console.log(desired);
                    
                    const device = devices.find((d) => { return d.address === registrationId });
                    device.deviceTwin = desired;
                    if (desired.edgeDeviceId === "INITIAL") {
                        device.deviceTwin.edgeDeviceId = currentEdgeDeviceId;
                    }

                    sendUpdateToDatabase(registrationId, device.deviceTwin.edgeDeviceId);

                    const report = {"edgeDeviceId": device.deviceTwin.edgeDeviceId}

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
        if (!alreadyDiscoveredDevice) {
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
        
        if (alreadyDiscoveredDevice && (alreadyDiscoveredDevice.status === "WAITING" || alreadyDiscoveredDevice.status === "DENIED" )) {

            const date = new Date()
            if (date > alreadyDiscoveredDevice.timeToRetry) {
                sendRegistrationRequest(deviceRegistrationObj);
                if (alreadyDiscoveredDevice.status === "WAITING") {
                    date.setSeconds(date.getSeconds() + 15);
                } else {
                    date.setHours(date.getHours() + 1);
                }
                alreadyDiscoveredDevice.timeToRetry = date;
            }
        }
        alreadyDiscoveredDevice && console.log("alreadyDiscoveredDevice.deviceTwin", alreadyDiscoveredDevice.deviceTwin);

        if (alreadyDiscoveredDevice && alreadyDiscoveredDevice.deviceTwin.edgeDeviceId === currentEdgeDeviceId) {
            const data = JSON.stringify(obj);
            const msg = new Message(data);
            msg.properties.add("type", "telemetry");
            moduleClient.sendEvent(msg, printResultFor("send"));
        }
    });
});

const sendRegistrationRequest = (deviceRegistrationObj) => {
    const data = JSON.stringify(deviceRegistrationObj);
    const msg = new Message(data);
    msg.properties.add("type", "device-registration");
    moduleClient.sendEvent(msg, printResultFor("send"));
}

const sendUpdateToDatabase = (registrationId, edgeDeviceId) => {
    const ids = {registrationId, edgeDeviceId}
    const data = JSON.stringify(ids);
    const msg = new Message(data);
    msg.properties.add("type", "device-update");
    moduleClient.sendEvent(msg, printResultFor("send"));
}

setInterval(() => {
    console.log(new Date())
    console.log(devices);
}, 1000)

const createUnixServer = () => {
    try {
        fs.unlinkSync(process.env.SOCKET_PATH);
    } catch (err) {} 
    unixServer.listen(process.env.SOCKET_PATH);
}