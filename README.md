# Ruuvi-tag-gateway

Azure IoT-edge solution

## Requirements

https://docs.microsoft.com/en-us/azure/iot-edge/how-to-vs-code-develop-module

## Environment setup

Create a file azure-iot-edge/.env with the following contents:

```
EDGE_DEVICE_ID=<edge device id>
PRIMARY_KEY=<primary key of the enrollment group in the device provisioning service>
IOT_HUB=<iot-hub url, e.g. weuoiotphub.azure-devices.net>
CONTAINER_REGISTRY_USERNAME=<container-registry username>
CONTAINER_REGISTRY_PASSWORD=<container-registry password>
CONTAINER_REGISTRY_ADDRESS=<container-registry url, e.g. openiotplatform.azurecr.io>
```
