// Creates or updates the ElevenLabs agent and its client tools from src/agent/definition.ts.
//   ELEVENLABS_API_KEY=… npm run provision                      → creates the agent, prints its id
//   ELEVENLABS_API_KEY=… ELEVENLABS_AGENT_ID=agent_… npm run provision   → updates it in place
// Optional: ELEVENLABS_VOICE_ID (a voice from your library), VOICE_LLM (model the agent thinks with),
// `--print` to only show what would be sent.
import { AGENT_TOOLS, agentConfig, toolConfig } from '../src/agent/definition';
import { ElevenLabsClient } from '../src/infrastructure/elevenlabs';

// «Allesia K — Warm, Sweet Conversational»: a Russian voice made for assistants.
const voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'iFe2eguusPG0FB7v6sbF';
const llm = process.env.VOICE_LLM ?? 'claude-haiku-5-5';

if (process.argv.includes('--print')) {
  console.log(JSON.stringify({ tools: AGENT_TOOLS.map(toolConfig), agent: agentConfig({ voiceId, llm, toolIds: AGENT_TOOLS.map((t) => `<id of ${t.name}>`) }) }, null, 2));
  process.exit(0);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error('Set ELEVENLABS_API_KEY');
const agentId = process.env.ELEVENLABS_AGENT_ID || undefined;
const client = new ElevenLabsClient({ apiKey, baseUrl: process.env.ELEVENLABS_API_URL ?? 'https://api.elevenlabs.io', transport: 'webrtc', timeoutMs: 30_000 });

// Tools are workspace-wide and matched by name, so running this twice never duplicates them.
const existing = await client.listTools();
const toolIds: string[] = [];
for (const tool of AGENT_TOOLS) {
  const id = await client.saveTool(toolConfig(tool), existing.find((t) => t.name === tool.name)?.id);
  toolIds.push(id);
  console.log(`tool ${tool.name} → ${id}`);
}

const saved = await client.saveAgent(agentConfig({ voiceId, llm, toolIds }), agentId);
console.log(`\n${agentId ? 'Updated' : 'Created'} agent ${saved}`);
if (!agentId) console.log(`Add to the environment:\n  VOICE_PROVIDER=elevenlabs\n  ELEVENLABS_AGENT_ID=${saved}`);
