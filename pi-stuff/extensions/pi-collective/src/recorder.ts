/**
 * Session Recorder: Captures the trajectory of a pi session
 */

import type { ContentBlock } from "@mariozechner/pi-coding-agent";

export interface RecordedMessage {
	role: "user" | "assistant";
	content: string;
	thinking?: string;
	toolCalls?: Array<{
		id: string;
		name: string;
		arguments: string;
	}>;
	timestamp: number;
}

export interface RecordedToolResult {
	toolCallId: string;
	toolName: string;
	content: ContentBlock[];
	details?: Record<string, unknown>;
	isError: boolean;
	timestamp: number;
}

export class SessionRecorder {
	private messages: RecordedMessage[] = [];
	private toolResults: Map<string, RecordedToolResult> = new Map();
	private modifiedFiles: Set<string> = new Set();
	private touchedFiles: Set<string> = new Set();  // All files read/written (for project detection)
	private toolCallCount = 0;

	recordUserMessage(prompt: string, images?: unknown[]): void {
		this.messages.push({
			role: "user",
			content: prompt,
			timestamp: Date.now(),
		});

		// If there are images, we could note that but not include the actual data
		// for privacy reasons
	}

	recordAssistantMessage(message: {
		content: unknown;
	}): void {
		const content = message.content;
		
		let text = "";
		let thinking = "";
		const toolCalls: RecordedMessage["toolCalls"] = [];

		if (Array.isArray(content)) {
			for (const part of content) {
				if (typeof part === "object" && part !== null) {
					const block = part as Record<string, unknown>;
					
					if (block.type === "text" && typeof block.text === "string") {
						text += block.text;
					} else if (block.type === "thinking" && typeof block.thinking === "string") {
						thinking += block.thinking;
					} else if (block.type === "toolCall") {
						this.toolCallCount++;
						toolCalls.push({
							id: String(block.id || ""),
							name: String(block.name || ""),
							arguments: JSON.stringify(block.arguments || {}),
						});
					}
				}
			}
		} else if (typeof content === "string") {
			text = content;
		}

		this.messages.push({
			role: "assistant",
			content: text,
			thinking: thinking || undefined,
			toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			timestamp: Date.now(),
		});
	}

	recordToolCall(toolName: string, toolCallId: string, input: Record<string, unknown>): void {
		const toolLower = toolName.toLowerCase();
		const path = input.path as string;
		
		// Track file modifications (write/edit)
		if (path && (toolLower === "write" || toolLower === "edit")) {
			this.modifiedFiles.add(this.normalizePath(path));
		}
		
		// Also track touched files for project detection (read/write/edit)
		if (path && (toolLower === "read" || toolLower === "write" || toolLower === "edit")) {
			this.touchedFiles.add(path); // Keep original path for git detection
		}
	}

	recordToolResult(
		toolCallId: string,
		toolName: string,
		content: ContentBlock[],
		details: Record<string, unknown> | undefined,
		isError: boolean
	): void {
		this.toolResults.set(toolCallId, {
			toolCallId,
			toolName,
			content: this.sanitizeContent(content),
			details: this.sanitizeDetails(details),
			isError,
			timestamp: Date.now(),
		});
	}

	isEmpty(): boolean {
		return this.messages.length === 0;
	}

	getMessageCount(): number {
		return this.messages.length;
	}

	getToolCallCount(): number {
		return this.toolCallCount;
	}

	getModifiedFiles(): Set<string> {
		return this.modifiedFiles;
	}

	getTouchedFiles(): Set<string> {
		return this.touchedFiles;
	}

	getMessages(): RecordedMessage[] {
		return [...this.messages];
	}

	getToolResults(): Map<string, RecordedToolResult> {
		return new Map(this.toolResults);
	}

	/**
	 * Build the full trajectory in the standard message format
	 */
	buildTrajectory(): Array<{
		role: "system" | "user" | "assistant" | "tool";
		content?: string;
		thinking?: string;
		tool_calls?: Array<{
			id: string;
			type: "function";
			function: {
				name: string;
				arguments: string;
			};
		}>;
		tool_call_id?: string;
		name?: string;
	}> {
		const trajectory: Array<{
			role: "system" | "user" | "assistant" | "tool";
			content?: string;
			thinking?: string;
			tool_calls?: Array<{
				id: string;
				type: "function";
				function: {
					name: string;
					arguments: string;
				};
			}>;
			tool_call_id?: string;
			name?: string;
		}> = [];

		// Add a generic system prompt (we don't include the full pi system prompt)
		trajectory.push({
			role: "system",
			content:
				"You are a helpful coding assistant with access to tools for reading files, executing commands, and editing code.",
		});

		for (const msg of this.messages) {
			if (msg.role === "user") {
				trajectory.push({
					role: "user",
					content: msg.content,
				});
			} else if (msg.role === "assistant") {
				const assistantMsg: (typeof trajectory)[number] = {
					role: "assistant",
					content: msg.content || undefined,
					thinking: msg.thinking,
				};

				if (msg.toolCalls && msg.toolCalls.length > 0) {
					assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
						id: tc.id,
						type: "function" as const,
						function: {
							name: tc.name,
							arguments: tc.arguments,
						},
					}));

					// Add tool results after this message
					trajectory.push(assistantMsg);

					for (const tc of msg.toolCalls) {
						const result = this.toolResults.get(tc.id);
						if (result) {
							trajectory.push({
								role: "tool",
								tool_call_id: tc.id,
								name: tc.name,
								content: this.contentToString(result.content),
							});
						}
					}
				} else {
					trajectory.push(assistantMsg);
				}
			}
		}

		return trajectory;
	}

	private normalizePath(path: string): string {
		// Remove leading ./ and make relative
		return path.replace(/^\.\//, "").replace(/^\//, "");
	}

	private sanitizeContent(content: ContentBlock[]): ContentBlock[] {
		// For now, keep content as-is but could redact sensitive info
		return content;
	}

	private sanitizeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
		if (!details) return undefined;

		// Remove potentially sensitive fields
		const sanitized = { ...details };
		delete sanitized.absolutePath;
		delete sanitized.env;
		delete sanitized.cwd;

		return sanitized;
	}

	private contentToString(content: ContentBlock[]): string {
		return content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");
	}
}
