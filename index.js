const net = require("net");
const mqtt = require("azure-iot-device-mqtt").Mqtt;
const deviceClient = require("azure-iot-device").Client;
const message = require("azure-iot-device").Message;
var {deviceConnectionString, deviceTwinConnectionString} = require("./connection-strings.json");

const client = deviceClient.fromConnectionString(deviceConnectionString, mqtt);

let ruuvitags = [];

const printResultFor = op => {
    return (err, res) => {
        if (err) console.log(op + " error: " + err.toString());
        if (res) console.log(op + " status: " + res.constructor.name);
    };
}

const unixServer = net.createServer(socket => {
    socket.on("data", function(data) {
        let telemetry = JSON.parse(data.toString());
        console.log(telemetry);
        const obj = {
            address: telemetry.device.address,
            temperature: telemetry.sensors.temperature,
            humidity: telemetry.sensors.humidity,
            pressure: telemetry.sensors.pressure,
            time: new Date().toISOString()
        };
        ruuvitags = ruuvitags.filter(a => a.address != obj.address);
        ruuvitags.push(obj);
        ruuvitags = ruuvitags.sort((a, b) => (a.address > b.address ? 1 : -1));
    });
});

setInterval(() => {
    if(ruuvitags.length === 0) return;

    console.clear();
    console.log("current time:", "\t", new Date().toISOString(), "\n");
    console.log(ruuvitags);
    
    // const data = JSON.stringify(ruuvitags);
    // const msg = new message(data);
    // client.sendEvent(msg, printResultFor("send"));
    
}, 3000);

unixServer.listen(process.env.SOCKETPATH);
