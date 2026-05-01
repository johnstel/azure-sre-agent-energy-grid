import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getScenarioDescription,
  getScenarioPrompt,
  PORTAL_VALIDATION_SCENARIOS,
} from './PortalValidationService.js';
import { getScenarios } from './ScenarioService.js';
import type { PortalValidationScenarioName } from '../types/index.js';

const PORTAL_TO_NARRATION_SCENARIO: Record<PortalValidationScenarioName, string> = {
  OOMKilled: 'oom-killed',
  MongoDBDown: 'mongodb-down',
  ServiceMismatch: 'service-mismatch',
};

describe('PortalValidationService shared scenario metadata', () => {
  it('keeps Portal Validation scoped to Dallas-approved core scenarios', () => {
    assert.deepEqual([...PORTAL_VALIDATION_SCENARIOS], ['OOMKilled', 'MongoDBDown', 'ServiceMismatch']);
  });

  it('derives prompts and descriptions from shared narration metadata', () => {
    const scenarios = getScenarios();

    for (const portalScenarioName of PORTAL_VALIDATION_SCENARIOS) {
      const narrationScenarioName = PORTAL_TO_NARRATION_SCENARIO[portalScenarioName];
      const scenario = scenarios.find(item => item.name === narrationScenarioName);
      assert.ok(scenario?.narration, `${portalScenarioName} missing shared narration metadata`);
      assert.equal(getScenarioPrompt(portalScenarioName), scenario.narration.suggestedPrompt.text);
      assert.equal(getScenarioDescription(portalScenarioName), scenario.narration.title);
    }
  });
});
