/* eslint-disable strict */
'use strict';

const mqtt = require('azure-iot-device-mqtt').Mqtt;
const ModuleClient = require('azure-iot-device').ModuleClient;
const DeviceClient = require('azure-iot-device').Client;
const Message = require('azure-iot-device').Message;
const net = require('net');
const fs = require('fs');
const crypto = require('crypto');
const reportedPropertiesHandler = require('./reportedPropertiesHandler');
const messageLevelHandler = require('./messageLevelHandler');

const currentEdgeDeviceId = process.env.IOTEDGE_DEVICEID;
const primaryKey = process.env.PRIMARY_KEY;
const iotHub = process.env.IOT_HUB;

const devices = [];

const MODULE_NAME = 'RuuviTagGateway';
const DEVICE_REGISTRATION_METHOD_NAME = 'DeviceRegistrationAttempted';

const printResultFor = op => {
  return (err, res) => {
    if (err) console.log(op + ' error: ' + err.toString());
    if (res) console.log(op + ' status: ' + res.constructor.name);
  };
};

let moduleClient;
ModuleClient.fromEnvironment(mqtt, function (err, client) {
  if (err) {
    throw err;
  } else {
    client.on('error', function (err) {
      throw err;
    });

    client.onMethod(DEVICE_REGISTRATION_METHOD_NAME, (request, response) => {
      console.log(`${DEVICE_REGISTRATION_METHOD_NAME} method called`, request);
      handleDeviceRegistrationMessage(request.payload);
      response.send(200, '', function (err) {
        if (err) {
          console.log(
            `Error sending response to ${DEVICE_REGISTRATION_METHOD_NAME} method`,
            err
          );
        } else {
          console.log(
            `Response to ${DEVICE_REGISTRATION_METHOD_NAME} method sent successfully`
          );
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
  const {edgeDeviceId, deviceTwin, wasSuccessful, registrationId} = iotHubMsg;

  console.log('\n HANDLE MESSAGE');
  console.log('registrationId', registrationId);
  console.log('edgeDeviceId', edgeDeviceId);
  console.log('deviceTwin', deviceTwin);
  console.log('wasSuccessful', wasSuccessful);

  const device = devices.find(d => {
    return d.address === registrationId;
  });
  if (!device) {
    console.log(`Device with id ${registrationId} not found`);
    return;
  }
  if (
    wasSuccessful &&
    (device.status === 'WAITING' || device.status === 'DENIED')
  ) {
    device.status = 'REGISTERED';
    device.timeToRetry = null;
    openDeviceTwinConnection(registrationId);
  } else {
    const timeToRetry = new Date();
    timeToRetry.setHours(timeToRetry.getHours() + 1);
    device.timeToRetry = timeToRetry;
    device.status = 'DENIED';
  }
};

const openDeviceTwinConnection = registrationId => {
  console.log('Open device twin connection');
  const symmetricKey = crypto
    .createHmac('SHA256', Buffer.from(primaryKey, 'base64'))
    .update(registrationId, 'utf8')
    .digest('base64');

  const connectionString =
    'HostName=' +
    iotHub +
    ';DeviceId=' +
    registrationId +
    ';SharedAccessKey=' +
    symmetricKey;

  const deviceClient = DeviceClient.fromConnectionString(
    connectionString,
    mqtt
  );
  deviceClient.open(err => {
    if (err) {
      console.log('error setting up device twin:', err);
    } else {
      deviceClient.getTwin((err, twin) => {
        if (err) {
          console.error('error getting device twin:', err);
        }

        const device = devices.find(d => d.address === registrationId);

        // Set the twin object to device.deviceTwin. The deviceClient handles
        // syncing the desired properties to the twin.
        device.deviceTwin = twin;

        twin.on('properties.desired', desired => {
          // console.log("new desired properties received:", JSON.stringify(desired));

          if (desired.edgeDeviceId === 'INITIAL' || !desired.edgeDeviceId) {
            device.edgeDeviceId = currentEdgeDeviceId;
          } else {
            device.edgeDeviceId = desired.edgeDeviceId;
          }

          // At this point the twin has been updated. Patch of reported properties can be generated
          // by comparing the twins desired and reported properties
          const reportedPropertiesPatch = reportedPropertiesHandler.generatePatch(
            twin,
            device.edgeDeviceId
          );

          twin.properties.reported.update(reportedPropertiesPatch, err => {
            if (err) {
              console.log('Error updating twin state', err);
            }
            console.log(
              'Twin state reported:',
              JSON.stringify(reportedPropertiesPatch)
            );
          });
        });
      });
    }
  });
};

const unixServer = net.createServer(socket => {
  socket.on('data', function (data) {
    let telemetry;
    try {
      telemetry = JSON.parse(data.toString());
    } catch (ex) {
      return;
    }

    const alreadyDiscoveredDevice = devices.find(
      d => d.address === telemetry.device.address
    );
    const deviceRegistrationObj = {
      edgeDeviceId: currentEdgeDeviceId,
      address: telemetry.device.address,
      callbackModule: MODULE_NAME,
      callbackMethod: DEVICE_REGISTRATION_METHOD_NAME
    };
    if (!alreadyDiscoveredDevice) {
      const timeToRetry = new Date();
      timeToRetry.setSeconds(timeToRetry.getSeconds() + 15);
      const device = {
        status: 'WAITING',
        address: telemetry.device.address,
        timeToRetry: timeToRetry,
        deviceTwin: {}
      };
      devices.push(device);
      // for the device we have to wait 15 seconds to see the status and if its WAITING then RETRY
      sendRegistrationRequest(deviceRegistrationObj);
    }

    if (
      alreadyDiscoveredDevice &&
      (alreadyDiscoveredDevice.status === 'WAITING' ||
        alreadyDiscoveredDevice.status === 'DENIED')
    ) {
      const date = new Date();
      if (date > alreadyDiscoveredDevice.timeToRetry) {
        sendRegistrationRequest(deviceRegistrationObj);
        if (alreadyDiscoveredDevice.status === 'WAITING') {
          date.setSeconds(date.getSeconds() + 15);
        } else {
          date.setHours(date.getHours() + 1);
        }
        alreadyDiscoveredDevice.timeToRetry = date;
      }
    }

    if (
      alreadyDiscoveredDevice &&
      alreadyDiscoveredDevice.edgeDeviceId === currentEdgeDeviceId
    ) {
      const telemetryData = {
        address: telemetry.device.address,
        rssi: telemetry.rssi,
        temperature: telemetry.sensors.temperature,
        humidity: telemetry.sensors.humidity,
        pressure: telemetry.sensors.pressure,
        voltage: telemetry.sensors.voltage,
        tx_power: telemetry.sensors.txpower,
        time: new Date().toISOString()
      };

      const msg = new Message(JSON.stringify(telemetryData));

      msg.properties.add('type', 'telemetry');
      msg.properties.add(
        'level',
        messageLevelHandler.resolveLevel(
          telemetryData,
          alreadyDiscoveredDevice.deviceTwin
        )
      );
      //console.log("Send msg", JSON.stringify(msg));
      moduleClient.sendEvent(msg, printResultFor('send'));
    }
  });
});

const sendRegistrationRequest = deviceRegistrationObj => {
  const data = JSON.stringify(deviceRegistrationObj);
  const msg = new Message(data);
  msg.properties.add('type', 'device-registration');
  moduleClient.sendEvent(msg, printResultFor('send'));
};

setInterval(() => {
  console.log(new Date());
  console.log(
    devices.map(d => {
      return d.address + ': ' + d.status;
    })
  );
}, 2000);

const createUnixServer = () => {
  fs.unlinkSync(process.env.SOCKET_PATH);
  unixServer.listen(process.env.SOCKET_PATH);
};
