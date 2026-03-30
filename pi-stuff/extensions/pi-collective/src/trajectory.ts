/**
 * Trajectory Formatter: Converts recorded sessions to the standard format
 */

import { randomUUID } from "node:crypto";
import type { SessionRecorder } from "./recorder.js";
import { generateStandaloneDockerfile, type DockerfileConfig } from "./dockerfile-generator.js";

export interface Trajectory {
	// Metadata
	format_version: string;
	trajectory_id: string;
	timestamp: string;

	// Source context
	source: {
		repo_url: string | null;
		repo_license: string | null;
		commit_before: string | null;
		commit_after: string | null;
		languages_used: string[];
		language_primary: string | null;
	};

	// The actual trajectory
	messages: Array<{
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
	}>;

	// Outcome & reward
	outcome: {
		success: boolean;
		tests_passed: boolean;
		committed: boolean;
		commit_sha: string | null;
		files_changed: string[];
	};
	reward: number;

	// Environment reproduction
	// This Dockerfile recreates the exact project state at trajectory start
	environment: {
		docker_compatible: boolean;
		test_command: string | null;
		dockerfile: string | null;  // The actual Dockerfile content
	};

	// Collection metadata
	collector: {
		tool: string;
		version: string;
		consent_timestamp: string;
	};
}

interface GateCheckResults {
	allPassed: boolean;
	isPublicRepo: boolean;
	repoInfo: { owner: string; repo: string; url: string; license?: string } | null;
	hasSelfContainedTests: boolean;
	testInfo: { command: string; dockerfile: string } | null;
	noPII: boolean;
	isCommitted: boolean;
	commitInfo: { sha: string; message: string } | null;
}

export function formatTrajectory(
	recorder: SessionRecorder,
	gateResults: GateCheckResults,
	startCommit: string | null
): Trajectory {
	const messages = recorder.buildTrajectory();
	const modifiedFiles = [...recorder.getModifiedFiles()];

	// Detect languages from tool calls
	const languagesUsed = detectLanguages(recorder);
	const primaryLanguage = languagesUsed[0] ?? null;

	// Calculate reward
	const reward = calculateReward(gateResults);

	// Generate Dockerfile if we have all the info
	let dockerfile: string | null = null;
	if (
		gateResults.repoInfo?.url &&
		startCommit &&
		primaryLanguage &&
		gateResults.testInfo?.command
	) {
		const dockerConfig: DockerfileConfig = {
			repoUrl: gateResults.repoInfo.url,
			commitSha: startCommit,
			language: primaryLanguage,
			testCommand: gateResults.testInfo.command,
		};
		dockerfile = generateStandaloneDockerfile(dockerConfig);
	}

	return {
		format_version: "1.1",
		trajectory_id: randomUUID(),
		timestamp: new Date().toISOString(),

		source: {
			repo_url: gateResults.repoInfo?.url ?? null,
			repo_license: gateResults.repoInfo?.license ?? null,
			commit_before: startCommit,
			commit_after: gateResults.commitInfo?.sha ?? null,
			languages_used: languagesUsed,
			language_primary: primaryLanguage,
		},

		messages,

		outcome: {
			success: gateResults.allPassed,
			tests_passed: gateResults.hasSelfContainedTests,
			committed: gateResults.isCommitted,
			commit_sha: gateResults.commitInfo?.sha ?? null,
			files_changed: modifiedFiles,
		},
		reward,

		environment: {
			docker_compatible: gateResults.hasSelfContainedTests,
			test_command: gateResults.testInfo?.command ?? null,
			dockerfile,
		},

		collector: {
			tool: "pi-collective",
			version: "0.1.0",
			consent_timestamp: new Date().toISOString(),
		},
	};
}

function detectLanguages(recorder: SessionRecorder): string[] {
	const languages = new Set<string>();
	const modifiedFiles = recorder.getModifiedFiles();

	const extensionToLanguage: Record<string, string> = {
		".ts": "typescript",
		".tsx": "typescript",
		".js": "javascript",
		".jsx": "javascript",
		".py": "python",
		".rs": "rust",
		".go": "go",
		".rb": "ruby",
		".java": "java",
		".kt": "kotlin",
		".swift": "swift",
		".c": "c",
		".cpp": "cpp",
		".h": "c",
		".hpp": "cpp",
		".cs": "csharp",
		".php": "php",
		".sh": "bash",
		".bash": "bash",
		".zsh": "bash",
		".sql": "sql",
		".html": "html",
		".css": "css",
		".scss": "scss",
		".json": "json",
		".yaml": "yaml",
		".yml": "yaml",
		".toml": "toml",
		".md": "markdown",
	};

	for (const file of modifiedFiles) {
		const ext = file.slice(file.lastIndexOf("."));
		const lang = extensionToLanguage[ext];
		if (lang) {
			languages.add(lang);
		}
	}

	// Also check for bash commands in tool results
	const messages = recorder.getMessages();
	for (const msg of messages) {
		if (msg.toolCalls) {
			for (const tc of msg.toolCalls) {
				if (tc.name === "bash") {
					languages.add("bash");
				}
			}
		}
	}

	return [...languages].sort();
}

function calculateReward(gateResults: GateCheckResults): number {
	let reward = 0;

	// Tests passed: +0.5
	if (gateResults.hasSelfContainedTests) {
		reward += 0.5;
	}

	// Committed: +0.3
	if (gateResults.isCommitted) {
		reward += 0.3;
	}

	// Public repo (verifiable): +0.1
	if (gateResults.isPublicRepo) {
		reward += 0.1;
	}

	// No PII: +0.1
	if (gateResults.noPII) {
		reward += 0.1;
	}

	return Math.min(reward, 1.0);
}

/**
 * Convert trajectory to JSONL format (one line)
 */
export function trajectoryToJSONL(trajectory: Trajectory): string {
	return JSON.stringify(trajectory);
}

/**
 * Parse a trajectory from JSONL
 */
export function parseTrajectoryJSONL(line: string): Trajectory {
	return JSON.parse(line) as Trajectory;
}
