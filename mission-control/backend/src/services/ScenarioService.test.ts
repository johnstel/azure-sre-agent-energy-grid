import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FORBIDDEN_NARRATION_RESPONSE_FIELDS, getScenarios } from './ScenarioService.js';

const FORBIDDEN_PHRASES = [
  'SRE Agent will',
  'The agent detects',
  'Agent automatically',
  'Root cause is',
  'Expected output:',
  'You should see the agent say',
  'quantified MTTR',
  'Production-ready',
  'GA-ready',
  'fully autonomous',
];

const OBSERVE_START_VERBS = /^(Check|Open|Run|Inspect|Compare) /;

describe('ScenarioService narration metadata', () => {
  it('provides narration for every registered scenario', () => {
    const scenarios = getScenarios();

    assert.equal(scenarios.length, 10);
    for (const scenario of scenarios) {
      assert.ok(scenario.narration, `${scenario.name} is missing narration metadata`);
      assert.equal(scenario.narration.scenarioName, scenario.name);
      assert.ok(scenario.narration.hook.length > 0, `${scenario.name} is missing a hook`);
      assert.ok(scenario.narration.observe.length > 0, `${scenario.name} is missing observe bullets`);
      assert.ok(scenario.narration.suggestedPrompt.text.length > 0, `${scenario.name} is missing a suggested prompt`);
      assert.ok(scenario.narration.restorePath.label.length > 0, `${scenario.name} is missing a restore path`);
      assert.ok(scenario.narration.sourceRefs.length > 0, `${scenario.name} is missing source refs`);
      assert.ok(scenario.narration.safetyNotes.length > 0, `${scenario.name} is missing safety notes`);
    }
  });

  it('does not expose deterministic Azure SRE Agent response fields', () => {
    for (const scenario of getScenarios()) {
      const keys = collectKeys(scenario.narration);
      for (const forbiddenField of FORBIDDEN_NARRATION_RESPONSE_FIELDS) {
        assert.equal(keys.has(forbiddenField), false, `${scenario.name} contains forbidden field ${forbiddenField}`);
      }
    }
  });

  it('keeps narration copy within the presenter-guidance contract', () => {
    for (const scenario of getScenarios()) {
      assert.ok(scenario.narration, `${scenario.name} is missing narration metadata`);
      for (const hook of scenario.narration.hook) {
        assert.ok(hook.length <= 140, `${scenario.name} hook exceeds 140 characters`);
        assert.match(hook, /^You /, `${scenario.name} hook must use second-person presenter voice`);
      }
      assert.ok(scenario.narration.observe.length <= 4, `${scenario.name} has too many observe bullets`);
      for (const bullet of scenario.narration.observe) {
        assert.match(bullet, OBSERVE_START_VERBS, `${scenario.name} observe bullet must start with an approved verb`);
        assert.match(bullet, /Mission Control|kubectl/, `${scenario.name} observe bullet must name Mission Control or kubectl output`);
      }
      assert.match(scenario.narration.restorePath.label, /Operator Restore|Manual Restore/, `${scenario.name} restore path must be operator/manual framed`);
      const copy = JSON.stringify(scenario.narration);
      for (const phrase of FORBIDDEN_PHRASES) {
        assert.equal(copy.includes(phrase), false, `${scenario.name} contains forbidden phrase "${phrase}"`);
      }
    }
  });
});

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (typeof value !== 'object' || value === null) return keys;
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectKeys(nested, keys);
  }
  return keys;
}
