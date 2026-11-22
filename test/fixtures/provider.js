import { fauxAssistantMessage, fauxProvider, fauxToolCall, getCurrentSystemPrompt, getCurrentTools } from '@earendil-works/pi-ai';

function textOf(content) {
  if (typeof content === 'string') return content;
  return content.filter(part => part.type === 'text').map(part => part.text).join('');
}

function answer(context) {
  const last = context.messages.at(-1);
  if (last.role === 'toolResult') {
    if (last.toolName === 'subagent') return fauxAssistantMessage(textOf(last.content));
    if (last.toolName !== 'read' || last.isError) throw new Error('Expected a successful Pi read');
    return fauxAssistantMessage('read: ' + textOf(last.content));
  }

  const users = context.messages.filter(message => message.role === 'user');
  const input = textOf(users.at(-1).content);
  if (input === 'inspect tools') {
    return fauxAssistantMessage(getCurrentTools(context.messages).map(tool => tool.name).sort().join(','));
  }
  if (input.startsWith('delegate ')) {
    return fauxAssistantMessage(fauxToolCall('subagent', JSON.parse(input.slice('delegate '.length))), { stopReason: 'toolUse' });
  }
  if (input.startsWith('Use the subagent tool with the chain parameter') && input.includes('template fixture')) {
    return fauxAssistantMessage('loaded official workflow');
  }
  if (input === 'Task: read fixture as planner') {
    const prompt = getCurrentSystemPrompt(context.messages) ?? '';
    const tools = getCurrentTools(context.messages).map(tool => tool.name);
    if (!prompt.includes('You are a planning specialist') || tools.includes('write') || tools.includes('subagent')) {
      throw new Error('The child must receive the planner prompt and tools');
    }
    return fauxAssistantMessage(fauxToolCall('read', { path: 'fixture.txt' }), { stopReason: 'toolUse' });
  }
  if (input === 'read fixture') {
    return fauxAssistantMessage(fauxToolCall('read', { path: 'fixture.txt' }), { stopReason: 'toolUse' });
  }
  if (input === 'history') return fauxAssistantMessage('history: ' + users.length);
  if (input === 'inspect profile') {
    const prompt = getCurrentSystemPrompt(context.messages) ?? '';
    const markers = prompt.match(/\b(?:ISP|PI)_(?:USER|PROJECT|EXTENSION)_CONTEXT\b/g) ?? [];
    return fauxAssistantMessage([...new Set(markers)].sort().join(','));
  }
  if (input === 'fail fixture') {
    return fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'Fixture request failed' });
  }
  return fauxAssistantMessage('echo: ' + input);
}

// Installed only in the temporary profiles created by the tests.
export default function registerFixture(pi) {
  const fake = fauxProvider({ provider: 'isp-test', api: 'isp-test', models: [{ id: 'fixture' }] });
  fake.setResponses([answer, answer]);
  pi.registerProvider(fake.provider);
}
