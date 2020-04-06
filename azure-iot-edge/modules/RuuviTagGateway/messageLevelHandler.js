const resolveLevel = (telemetryData, deviceTwin) => {
    if (matchesSomeRule(telemetryData, deviceTwin.properties.desired.alerts)) {
        return "alert";
    }
    if (matchesSomeRule(telemetryData, deviceTwin.properties.desired.warnings)) {
        return "warning";
    }
    return "normal";
}

const matchesSomeRule = (telemetryData, rules) => {
    if (!rules) {
        return false;
    }
    return Object.keys(rules).some((ruleKey) =>  {
        const rule = rules[ruleKey];
        return Object.keys(rule).every((subRuleKey) => {
            const subRule = rule[subRuleKey];
            if (telemetryData[subRule.field]) {
                return (subRule.operator === ">" && telemetryData[subRule.field] > subRule.value) ||
                       (subRule.operator === "<" && telemetryData[subRule.field] < subRule.value);
            }
            return false;
        });
    });
}

module.exports = {
    resolveLevel: resolveLevel
}
