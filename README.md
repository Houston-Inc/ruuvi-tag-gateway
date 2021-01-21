# Ruuvi-tag-gateway

Azure IoT-edge solution

## Requirements

https://docs.microsoft.com/en-us/azure/iot-edge/how-to-vs-code-develop-module

## Environment setup

Create a file azure-iot-edge/.env with the following contents:

```
IOTEDGE_DEVICEID=<edge device id in the iot-hub>
PRIMARY_KEY=<primary key of the enrollment group in the device provisioning service>
IOT_HUB=<iot-hub url, e.g. weuoiotphub.azure-devices.net>
CONTAINER_REGISTRY_USERNAME=<container-registry username>
CONTAINER_REGISTRY_PASSWORD=<container-registry password>
CONTAINER_REGISTRY_ADDRESS=<container-registry url, e.g. openiotplatform.azurecr.io>
```

## Deployment at scale

Assure that each edge device device twin has tags defining where/what the edge device is. For example:

```
"tags": {
    "location": {
        "floor": "houston-office"
    }
}
```

### Deployment from VSCode

Create a deployment manifest json from deployment template json. This can be done by right clicking on the deployment.template.json and click `generate deployment manifest`. Right click the generated `deployment.{architecture}.json` in the config folder and choose `Deployment at scale`.
By clicking this option the user would be asked about

- Deployment Id
- Target condition (for example: `tags.location.floor: "houston-office"`)
- Priority

Providing the above options would create a deployment config which could be viewed in Azure IotHub -> Iot Edge section.

The target condition needs to be given in the device twin of the edge device so that the edge device belongs to that deployment. The priority is also used to decide which deployment config the devices use. If there are multiple configs valid for a single device then the deployment config with the highest priority is valid for that device. In case of equal priority, the newest deployment config is used. The modules in the deployment config are uneditable so in case of a new version of a module a new deployment config needs to be created having an equal or greated priority then the current deployment config.
