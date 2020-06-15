const reportedPropertiesHandler = require('../reportedPropertiesHandler');
const assert = require('assert');

const twin = {
  properties: {
    desired: {
      alerts: {
        existingRule: {},
        existingRuleWithNewSubRule: {rule1: {}, rule2: {}},
        existingRuleWithRemovedSubRule: {rule1: {}},
        newRule: {}
      },
      warnings: {
        newRule: {}
      }
    },
    reported: {
      alerts: {
        existingRule: {},
        existingRuleWithNewSubRule: {rule1: {}},
        existingRuleWithRemovedSubRule: {rule1: {}, rule2: {}},
        removedRule: {}
      }
    }
  }
};

describe('Reported properties handler', function () {
  it('generates reported properties patch', function () {
    const expectedPatch = {
      edgeDeviceId: 'edge-device',
      alerts: {
        existingRule: {},
        existingRuleWithNewSubRule: {rule1: {}, rule2: {}},
        existingRuleWithRemovedSubRule: {rule1: {}, rule2: null},
        newRule: {},
        removedRule: null
      },
      warnings: {
        newRule: {}
      }
    };

    const actualPatch = reportedPropertiesHandler.generatePatch(
      twin,
      'edge-device'
    );

    assert.deepEqual(actualPatch, expectedPatch);
  });
});
