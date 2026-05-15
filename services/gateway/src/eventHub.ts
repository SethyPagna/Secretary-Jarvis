import type { ServerResponse } from "node:http";
import type { StreamEvent } from "@jarvis/core";

const SSE_HEADERS = {
  "access-control-allow-origin": "*",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "content-type": "text/event-stream; charset=utf-8",
};

export class EventHub {
  private readonly clients = new Set<ServerResponse>();
  private eventCounter = 0;

  addClient(response: ServerResponse): void {
    response.writeHead(200, SSE_HEADERS);
    response.write(": connected\n\n");
    this.clients.add(response);
    response.on("close", () => this.clients.delete(response));
  }

  publish(type: StreamEvent["type"], payload: Record<string, unknown>): StreamEvent {
    const event: StreamEvent = {
      id: `event-${++this.eventCounter}`,
      type,
      createdAt: new Date().toISOString(),
      payload,
    };

    const frame = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      client.write(frame);
    }
    return event;
  }
}
