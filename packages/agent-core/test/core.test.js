import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Agent as UpstreamAgent } from '@earendil-works/pi-agent-core';
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import { Agent } from '../dist/index.js';

async function runFixture(AgentClass) {
  const fake = fauxProvider({ provider: 'core-fixture', api: 'core-fixture' });
  const models = createModels();
  models.setProvider(fake.provider);
  const toolName = 'format_title';
  const toolResult = 'Title: local fixture';
  let executions = 0;
  const tool = {
    name: toolName,
    label: 'Format title',
    description: 'Format the title of a local fixture.',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title'],
      additionalProperties: false,
    },
    async execute(_id, { title }) {
      executions += 1;
      return { content: [{ type: 'text', text: 'Title: ' + title }] };
    },
  };
  fake.setResponses([
    fauxAssistantMessage(fauxToolCall(toolName, { title: 'local fixture' }, { id: 'fixture-tool-call' }), {
      stopReason: 'toolUse',
    }),
    context => {
      const result = context.messages.findLast(message => message.role === 'toolResult');
      assert.equal(result?.toolName, toolName);
      assert.equal(result?.isError, false);
      assert.equal(result?.content[0]?.text, toolResult);
      return fauxAssistantMessage('Formatted ' + result.content[0].text);
    },
  ]);
  const agent = new AgentClass({
    initialState: { systemPrompt: 'Format the test fixture.', model: fake.getModel(), tools: [tool] },
    streamFn: models.streamSimple.bind(models),
  });
  const events = [];
  const recorded = new Set(['agent_start', 'turn_start', 'tool_execution_start', 'tool_execution_end', 'turn_end', 'agent_end']);
  const unsubscribe = agent.subscribe(event => {
    if (recorded.has(event.type)) events.push(event.type);
  });
  try {
    await agent.prompt('Format the fixture title.');
  } finally {
    unsubscribe();
  }
  const messages = agent.state.messages;
  const answer = messages.at(-1).content.find(part => part.type === 'text').text;

  return {
    calls: fake.state.callCount,
    executions,
    roles: messages.map(message => message.role),
    events,
    answer,
  };
}

test('the fork compiles its own Agent and matches the upstream tool loop for the fixture', async () => {
  assert.notEqual(Agent, UpstreamAgent);
  const upstream = await runFixture(UpstreamAgent);
  const own = await runFixture(Agent);
  assert.deepEqual(own, upstream);
  assert.equal(own.calls, 2);
  assert.equal(own.executions, 1);
  assert.ok(own.roles.includes('toolResult'));
  assert.equal(own.answer, 'Formatted Title: local fixture');
  assert.deepEqual(own.events, [
    'agent_start', 'turn_start', 'tool_execution_start', 'tool_execution_end', 'turn_end',
    'turn_start', 'turn_end', 'agent_end',
  ]);
});
