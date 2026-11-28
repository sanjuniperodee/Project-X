import { z } from '@px/contracts';
import { AppError } from '@px/service-kit';
import type { VoiceProvider } from '../application/ports';

/** Minimal ElevenLabs Agents REST client: conversation credentials for the browser, and provisioning. */
export class ElevenLabsClient implements VoiceProvider {
  constructor(
    private readonly options: { apiKey: string; agentId?: string; baseUrl: string; transport: 'webrtc' | 'websocket'; timeoutMs?: number },
  ) {}

  async startConversation(): Promise<{ conversationToken: string } | { signedUrl: string }> {
    const agent = encodeURIComponent(this.options.agentId ?? '');
    if (this.options.transport === 'webrtc') {
      const { token } = await this.request('GET', `/v1/convai/conversation/token?agent_id=${agent}`, z.object({ token: z.string().min(1) }));
      return { conversationToken: token };
    }
    const { signed_url } = await this.request('GET', `/v1/convai/conversation/get-signed-url?agent_id=${agent}`, z.object({ signed_url: z.string().min(1) }));
    return { signedUrl: signed_url };
  }

  // ---- Provisioning (scripts/provision-agent.ts) ----

  async listTools(): Promise<Array<{ id: string; name: string }>> {
    const Tools = z.object({ tools: z.array(z.object({ id: z.string(), tool_config: z.object({ name: z.string() }) })) });
    const { tools } = await this.request('GET', '/v1/convai/tools', Tools);
    return tools.map((tool) => ({ id: tool.id, name: tool.tool_config.name }));
  }

  async saveTool(toolConfig: object, id?: string): Promise<string> {
    const Tool = z.object({ id: z.string() });
    const saved = id
      ? await this.request('PATCH', `/v1/convai/tools/${encodeURIComponent(id)}`, Tool, { tool_config: toolConfig })
      : await this.request('POST', '/v1/convai/tools', Tool, { tool_config: toolConfig });
    return saved.id;
  }

  async saveAgent(config: object, id?: string): Promise<string> {
    const Agent = z.object({ agent_id: z.string() });
    const saved = id
      ? await this.request('PATCH', `/v1/convai/agents/${encodeURIComponent(id)}`, Agent, config)
      : await this.request('POST', '/v1/convai/agents/create', Agent, config);
    return saved.agent_id;
  }

  private async request<S extends z.ZodType>(method: string, path: string, schema: S, body?: unknown): Promise<z.infer<S>> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.options.baseUrl), {
        method,
        headers: { 'xi-api-key': this.options.apiKey, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw AppError.unavailable(`ElevenLabs недоступен: ${(error as Error).message}`);
    }
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      // The provider's message helps the operator (wrong key, unknown agent) and carries no secrets.
      const detail = JSON.stringify((payload as { detail?: unknown } | undefined)?.detail ?? payload ?? '').slice(0, 300);
      throw AppError.unavailable(`ElevenLabs ответил ${response.status}: ${detail}`);
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new Error(`Unexpected ElevenLabs response for ${path}: ${parsed.error.message}`);
    return parsed.data;
  }
}
