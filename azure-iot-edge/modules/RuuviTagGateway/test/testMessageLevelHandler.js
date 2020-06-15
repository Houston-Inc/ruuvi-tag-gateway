const messageLevelHandler = require('../messageLevelHandler');
const assert = require('assert');

const twin = {
  properties: {
    desired: {
      alerts: {
        highTemperature: {
          rule1: {
            field: 'temperature',
            operator: '>',
            value: 25
          }
        },
        lowTemperatureAndHumidity: {
          rule1: {
            field: 'temperature',
            operator: '<',
            value: 15
          },
          rule2: {
            field: 'humidity',
            operator: '<',
            value: 15
          }
        }
      },
      warnings: {
        highTemperature: {
          rule1: {
            field: 'temperature',
            operator: '>',
            value: 23
          }
        }
      }
    }
  }
};

describe('Message level', function () {
  it('is normal if no rules match', function () {
    const telemetryData = {
      temperature: 23,
      humidity: 30
    };

    const level = messageLevelHandler.resolveLevel(telemetryData, twin);

    assert.equal(level, 'normal');
  });

  it('is warning if a warning rule matches', function () {
    const telemetryData = {
      temperature: 24,
      humidity: 30
    };

    const level = messageLevelHandler.resolveLevel(telemetryData, twin);

    assert.equal(level, 'warning');
  });

  it('is alert if an alert rule matches', function () {
    const telemetryData = {
      temperature: 26,
      humidity: 30
    };

    const level = messageLevelHandler.resolveLevel(telemetryData, twin);

    assert.equal(level, 'alert');
  });

  it('is normal if only one sub-rule of an alert rule matches', function () {
    const telemetryData = {
      temperature: 14,
      humidity: 16
    };

    const level = messageLevelHandler.resolveLevel(telemetryData, twin);

    assert.equal(level, 'normal');
  });

  it('is alert if all sub-rules of an alert rule matches', function () {
    const telemetryData = {
      temperature: 14,
      humidity: 14
    };

    const level = messageLevelHandler.resolveLevel(telemetryData, twin);

    assert.equal(level, 'alert');
  });
});
