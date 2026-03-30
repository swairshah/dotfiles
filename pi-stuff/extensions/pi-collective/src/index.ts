/**
 * pi-collective: Share coding trajectories for open-source model distillation
 *
 * "All for one, one for all."
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { checkPublicRepo } from "./gates/public-repo.js";
import { checkSelfContainedTests } from "./gates/self-contained-tests.js";
import { scanForPII } from "./gates/pii-scanner.js";
import { SessionRecorder } from "./recorder.js";
import { formatTrajectory } from "./trajectory.js";
import { saveTrajectory, listTrajectories, loadTrajectory, getStorageStats, getStorageDir } from "./storage.js";

// Session state
let recorder: SessionRecorder | null = null;
let startCommit: string | null = null;
let collectiveEnabled = true;  // Master toggle for the session
let detectedGitRoot: string | null = null;  // Git root detected from file operations

export default function (pi: ExtensionAPI) {
	// === SESSION LIFECYCLE ===

	// Helper to update status display
	function updateStatus(ctx: { ui: { setStatus: (id: string, text: string) => void } }) {
		if (!collectiveEnabled) {
			ctx.ui.setStatus("collective", "📊off");
		} else if (startCommit) {
			ctx.ui.setStatus("collective", "📊");
		} else {
			ctx.ui.setStatus("collective", "📊?");  // Not in a git repo
		}
	}

	// Initialize immediately (handles mid-session reload)
	async function initRecorder(cwd: string) {
		if (!recorder) {
			recorder = new SessionRecorder();
		}
		const effectiveRoot = detectedGitRoot || cwd;
		if (!startCommit) {
			startCommit = await getCurrentCommit(effectiveRoot);
		}
	}

	// Use the module-level findGitRoot function
	const detectGitRootFromPath = findGitRoot;

	// Reconstruct recorder state from session history
	async function reconstructRecorderFromSession(ctx: ExtensionContext) {
		recorder = new SessionRecorder();
		
		// Get existing messages from the session
		const entries = ctx.sessionManager.getBranch();
		
		for (const entry of entries) {
			if (entry.type !== "message") continue;
			
			const msg = entry.message;
			if (!msg) continue;
			
			if (msg.role === "user") {
				// Extract text content from user message
				const textContent = Array.isArray(msg.content)
					? msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n")
					: String(msg.content || "");
				recorder.recordUserMessage(textContent);
			} else if (msg.role === "assistant") {
				recorder.recordAssistantMessage(msg);
			} else if (msg.role === "toolResult" && msg.toolCallId && msg.toolName) {
				// Record tool result
				recorder.recordToolResult(
					msg.toolCallId,
					msg.toolName,
					msg.content || [],
					msg.details,
					msg.isError || false
				);
				
				// Try to detect git root from tool results that have file paths
				if (!detectedGitRoot && msg.details?.path) {
					const root = await findGitRoot(String(msg.details.path), ctx.cwd);
					if (root) {
						detectedGitRoot = root;
					}
				}
			}
			
			// Check assistant messages for tool calls
			if (msg.role === "assistant" && Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (part && typeof part === "object" && part.type === "toolCall") {
						const toolCall = part as { id?: string; name?: string; arguments?: Record<string, unknown> };
						if (toolCall.name && toolCall.id) {
							recorder.recordToolCall(toolCall.name, toolCall.id, toolCall.arguments || {});
							
							// Try to detect git root from file paths in tool calls
							const filePath = toolCall.arguments?.path;
							if (!detectedGitRoot && filePath && typeof filePath === "string") {
								const root = await findGitRoot(filePath, ctx.cwd);
								if (root) {
									detectedGitRoot = root;
								}
							}
						}
					}
				}
			}
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		// Reset detection for new session
		detectedGitRoot = null;
		
		// Reconstruct recorder from existing session history
		await reconstructRecorderFromSession(ctx);
		
		// Capture starting git state
		startCommit = await getCurrentCommit(detectedGitRoot || ctx.cwd);

		updateStatus(ctx);
	});
	
	// Also init on session_switch (e.g., /resume)
	pi.on("session_switch", async (_event, ctx) => {
		detectedGitRoot = null;  // Reset detection
		
		// Reconstruct recorder from session history
		await reconstructRecorderFromSession(ctx);
		
		startCommit = await getCurrentCommit(detectedGitRoot || ctx.cwd);
		updateStatus(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (!collectiveEnabled) {
			// User disabled collective for this session
			recorder = null;
			startCommit = null;
			return;
		}

		if (!recorder || recorder.isEmpty()) {
			return;
		}

		// Run gate checks
		const gateResults = await runGateChecks(ctx);

		if (gateResults.allPassed) {
			// All gates passed - save trajectory locally
			const trajectory = formatTrajectory(recorder, gateResults, startCommit);

			try {
				const stored = await saveTrajectory(trajectory);
				
				ctx.ui.notify(
					`📊 Trajectory saved!\n` +
					`   ${stored.trajectoryPath}\n` +
					`   ${stored.dockerfilePath ? `Dockerfile: ${stored.dockerfilePath}` : ""}`,
					"success"
				);
			} catch (error) {
				ctx.ui.notify(
					`Failed to save trajectory: ${error instanceof Error ? error.message : "Unknown error"}`,
					"error"
				);
			}
		} else {
			// Show why we can't save (for debugging)
			const reasons = gateResults.failures.join(", ");
			ctx.ui.notify(`📊 Trajectory not saved: ${reasons}`, "info");
		}

		recorder = null;
		startCommit = null;
	});

	// === TRAJECTORY RECORDING ===

	pi.on("before_agent_start", async (event, ctx) => {
		if (!collectiveEnabled) return;
		// Initialize if needed (handles mid-session extension load)
		await initRecorder(ctx.cwd);
		recorder?.recordUserMessage(event.prompt, event.images);
	});

	pi.on("message_end", async (event, _ctx) => {
		if (!collectiveEnabled) return;
		if (event.message.role === "assistant") {
			recorder?.recordAssistantMessage(event.message);
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!collectiveEnabled) return;
		recorder?.recordToolCall(event.toolName, event.toolCallId, event.input);
		
		// Try to detect git root from file operations
		if (!detectedGitRoot) {
			const input = event.input as Record<string, unknown>;
			const filePath = input.path as string | undefined;
			const toolLower = event.toolName.toLowerCase();
			if (filePath && (toolLower.includes("read") || toolLower.includes("write") || toolLower.includes("edit"))) {
				const root = await detectGitRootFromPath(filePath, ctx.cwd);
				if (root) {
					detectedGitRoot = root;
					// Also try to get the commit now
					if (!startCommit) {
						startCommit = await getCurrentCommit(root);
					}
					updateStatus(ctx);
				}
			}
		}
	});

	pi.on("tool_result", async (event, _ctx) => {
		if (!collectiveEnabled) return;
		recorder?.recordToolResult(event.toolCallId, event.toolName, event.content, event.details, event.isError);
	});

	// === COMMANDS ===

	pi.registerCommand("collective-toggle", {
		description: "Toggle trajectory recording on/off for this session",
		handler: async (_args, ctx) => {
			collectiveEnabled = !collectiveEnabled;
			
			if (collectiveEnabled) {
				// Re-initialize recorder if it was cleared
				if (!recorder) {
					recorder = new SessionRecorder();
				}
				ctx.ui.notify("📊 Collective enabled - trajectories will be recorded", "info");
			} else {
				ctx.ui.notify("📊 Collective disabled - no trajectories will be saved this session", "info");
			}
			
			updateStatus(ctx);
		},
	});

	pi.registerCommand("collective-status", {
		description: "Show pi-collective recording status and gate check results",
		handler: async (_args, ctx) => {
			if (!collectiveEnabled) {
				ctx.ui.notify("📊 pi-collective is DISABLED for this session\n\nUse /collective-toggle to enable", "info");
				return;
			}

			const gateResults = await runGateChecks(ctx);

			let status = "📊 pi-collective Status\n\n";
			status += `Recording: ${collectiveEnabled ? "ON" : "OFF"}\n`;
			status += `Messages recorded: ${recorder?.getMessageCount() ?? 0}\n`;
			status += `Tool calls: ${recorder?.getToolCallCount() ?? 0}\n\n`;

			status += "Gate Checks:\n";
			
			// Public repo check
			if (gateResults.isPublicRepo) {
				status += `  ✓ Public GitHub repo: ${gateResults.repoInfo?.url}\n`;
			} else {
				const reason = gateResults.failures.find(f => f.includes("repo") || f.includes("GitHub") || f.includes("remote"));
				status += `  ✗ Public GitHub repo: ${reason || "Not detected"}\n`;
			}
			
			// Tests check
			if (gateResults.hasSelfContainedTests) {
				status += `  ✓ Self-contained tests: ${gateResults.testInfo?.command}\n`;
			} else {
				const reason = gateResults.failures.find(f => f.includes("test") || f.includes("language"));
				status += `  ✗ Self-contained tests: ${reason || "Not detected"}\n`;
			}
			
			// PII check
			if (gateResults.noPII) {
				status += `  ✓ No PII/secrets detected\n`;
			} else {
				status += `  ✗ PII/secrets detected: ${gateResults.piiFindings.length} findings\n`;
				// Show first 3 findings
				for (const finding of gateResults.piiFindings.slice(0, 3)) {
					status += `      - ${finding.type} in ${finding.file}:${finding.line}\n`;
				}
				if (gateResults.piiFindings.length > 3) {
					status += `      ... and ${gateResults.piiFindings.length - 3} more\n`;
				}
			}
			
			// Commit check
			if (gateResults.isCommitted) {
				status += `  ✓ Changes committed: ${gateResults.commitInfo?.sha?.slice(0, 7)}\n`;
			} else {
				const reason = gateResults.failures.find(f => f.includes("commit") || f.includes("git"));
				status += `  ✗ Changes committed: ${reason || "Not yet"}\n`;
			}

			if (gateResults.allPassed) {
				status += `\n✅ Ready to save trajectory on session end!`;
			} else {
				status += `\n⚠️  Some checks failed - trajectory won't be saved`;
			}

			ctx.ui.notify(status, gateResults.allPassed ? "success" : "info");
		},
	});

	pi.registerCommand("collective-preview", {
		description: "Preview the trajectory that would be saved",
		handler: async (_args, ctx) => {
			if (!recorder || recorder.isEmpty()) {
				ctx.ui.notify("No trajectory recorded yet", "warning");
				return;
			}

			const gateResults = await runGateChecks(ctx);
			const trajectory = formatTrajectory(recorder, gateResults, startCommit);

			// Show in editor for inspection
			await ctx.ui.editor("Trajectory Preview (read-only)", JSON.stringify(trajectory, null, 2));
		},
	});

	pi.registerCommand("collective-list", {
		description: "List all locally stored trajectories",
		handler: async (_args, ctx) => {
			const files = await listTrajectories();
			const stats = await getStorageStats();

			if (files.length === 0) {
				ctx.ui.notify(`No trajectories stored yet.\nStorage: ${getStorageDir()}`, "info");
				return;
			}

			let output = `📊 pi-collective Storage\n`;
			output += `   Location: ${getStorageDir()}\n`;
			output += `   Total: ${stats.totalTrajectories} trajectories (${stats.totalSize})\n`;
			output += `   Range: ${stats.oldestDate} to ${stats.newestDate}\n\n`;
			output += `Recent trajectories:\n`;

			// Show last 10
			for (const file of files.slice(0, 10)) {
				output += `   ${file}\n`;
			}

			if (files.length > 10) {
				output += `   ... and ${files.length - 10} more\n`;
			}

			ctx.ui.notify(output, "info");
		},
	});

	pi.registerCommand("collective-view", {
		description: "View a stored trajectory by filename",
		handler: async (args, ctx) => {
			if (!args) {
				// Show list and let user pick
				const files = await listTrajectories();
				if (files.length === 0) {
					ctx.ui.notify("No trajectories stored yet", "warning");
					return;
				}

				const selected = await ctx.ui.select("Select trajectory to view:", files.slice(0, 20));
				if (!selected) return;
				args = selected;
			}

			const trajectory = await loadTrajectory(args);
			if (!trajectory) {
				ctx.ui.notify(`Trajectory not found: ${args}`, "error");
				return;
			}

			await ctx.ui.editor(`Trajectory: ${args}`, JSON.stringify(trajectory, null, 2));
		},
	});

	pi.registerCommand("collective-dir", {
		description: "Open the trajectory storage directory",
		handler: async (_args, ctx) => {
			const dir = getStorageDir();
			ctx.ui.notify(`Storage directory: ${dir}`, "info");
			
			// Try to open in file manager
			try {
				const { exec } = await import("child_process");
				const platform = process.platform;
				if (platform === "darwin") {
					exec(`open "${dir}"`);
				} else if (platform === "linux") {
					exec(`xdg-open "${dir}"`);
				} else if (platform === "win32") {
					exec(`explorer "${dir}"`);
				}
			} catch {
				// Silently fail if we can't open
			}
		},
	});

	pi.registerCommand("collective-debug", {
		description: "Debug info for pi-collective",
		handler: async (_args, ctx) => {
			const { execSync } = await import("child_process");
			const effectiveRoot = detectedGitRoot || ctx.cwd;
			const gitOpts = { cwd: effectiveRoot, encoding: "utf-8" as const, stdio: ["pipe", "pipe", "pipe"] as const };
			
			let debug = `📊 pi-collective Debug\n\n`;
			debug += `Working directory: ${ctx.cwd}\n`;
			debug += `Detected git root: ${detectedGitRoot || "(not detected yet)"}\n`;
			debug += `Effective root: ${effectiveRoot}\n\n`;
			
			// Check git status
			debug += `Git checks (in ${effectiveRoot}):\n`;
			try {
				const remoteUrl = (execSync("git remote get-url origin", gitOpts) as string).trim();
				debug += `  ✓ Remote origin: ${remoteUrl}\n`;
			} catch (e) {
				debug += `  ✗ Remote origin: ${e instanceof Error ? e.message : "failed"}\n`;
			}
			
			try {
				const head = (execSync("git rev-parse HEAD", gitOpts) as string).trim();
				debug += `  ✓ HEAD: ${head.slice(0, 8)}\n`;
			} catch (e) {
				debug += `  ✗ HEAD: ${e instanceof Error ? e.message : "failed"}\n`;
			}
			
			try {
				const isRepo = (execSync("git rev-parse --is-inside-work-tree", gitOpts) as string).trim();
				debug += `  ✓ Is git repo: ${isRepo}\n`;
			} catch (e) {
				debug += `  ✗ Is git repo: no\n`;
			}
			
			debug += `\nRecorder state:\n`;
			debug += `  Enabled: ${collectiveEnabled}\n`;
			debug += `  Recorder exists: ${recorder !== null}\n`;
			debug += `  Modified files: ${[...(recorder?.getModifiedFiles() ?? [])].join(", ") || "(none)"}\n`;
			debug += `  Touched files: ${[...(recorder?.getTouchedFiles() ?? [])].slice(0, 5).join(", ") || "(none)"}\n`;
			
			// Run gate checks and show details
			const gateResults = await runGateChecks(ctx);
			debug += `\nGate check details:\n`;
			debug += `  Effective root: ${detectedGitRoot || ctx.cwd}\n`;
			debug += `  Public repo: ${gateResults.isPublicRepo ? `✓ ${gateResults.repoInfo?.url}` : `✗`}\n`;
			debug += `  Tests: ${gateResults.hasSelfContainedTests ? `✓ ${gateResults.testInfo?.command}` : `✗`}\n`;
			debug += `  PII clean: ${gateResults.noPII ? `✓` : `✗ ${gateResults.piiFindings.length} findings`}\n`;
			if (!gateResults.noPII) {
				for (const finding of gateResults.piiFindings.slice(0, 5)) {
					debug += `    - ${finding.type} in ${finding.file}:${finding.line}\n`;
				}
			}
			const modifiedCount = recorder?.getModifiedFiles().size ?? 0;
			if (modifiedCount === 0) {
				debug += `  Committed: ✓ (read-only session, no commit needed)\n`;
			} else {
				debug += `  Committed: ${gateResults.isCommitted ? `✓ ${gateResults.commitInfo?.sha?.slice(0,7)}` : `✗ (${modifiedCount} files modified but not committed)`}\n`;
			}
			debug += `  Messages: ${recorder?.getMessageCount() ?? 0}\n`;
			debug += `  Tool calls: ${recorder?.getToolCallCount() ?? 0}\n`;
			debug += `  Start commit: ${startCommit ?? "null"}\n`;
			
			// Check files
			debug += `\nProject files:\n`;
			try {
				const files = (execSync("ls -la", gitOpts) as string);
				debug += files.split("\n").slice(0, 10).map(l => `  ${l}`).join("\n");
			} catch {
				debug += `  (could not list files)\n`;
			}
			
			ctx.ui.notify(debug, "info");
		},
	});

	pi.registerCommand("collective-docker", {
		description: "Generate a self-contained Docker environment for a trajectory",
		handler: async (args, ctx) => {
			// If no args, let user pick from recent trajectories
			let filename = args;
			if (!filename) {
				const files = await listTrajectories();
				if (files.length === 0) {
					ctx.ui.notify("No trajectories stored yet", "warning");
					return;
				}
				const selected = await ctx.ui.select("Select trajectory:", files.slice(0, 20));
				if (!selected) return;
				filename = selected;
			}

			const trajectory = await loadTrajectory(filename);
			if (!trajectory) {
				ctx.ui.notify(`Trajectory not found: ${filename}`, "error");
				return;
			}

			// Check if we have enough info to generate Dockerfile
			const repoUrl = trajectory.source.repo_url;
			const commitBefore = trajectory.source.commit_before;
			const language = trajectory.source.language_primary;
			const testCommand = trajectory.environment?.test_command;

			if (!repoUrl || !commitBefore) {
				ctx.ui.notify(
					`Cannot generate Dockerfile - missing repo info:\n` +
					`  repo_url: ${repoUrl || "missing"}\n` +
					`  commit: ${commitBefore || "missing"}`,
					"error"
				);
				return;
			}

			// Import the generator
			const { generateDockerfile } = await import("./dockerfile-generator.js");
			
			const result = await generateDockerfile({
				repoUrl,
				commitSha: commitBefore,
				language: language || "python",
				testCommand: testCommand || "echo 'No test command specified'",
			});

			// Save to dockerfiles directory
			const { mkdir, writeFile } = await import("node:fs/promises");
			const { join } = await import("node:path");
			const { homedir } = await import("node:os");
			
			const dockerDir = join(homedir(), ".pi", "collective", "dockerfiles", trajectory.trajectory_id);
			await mkdir(dockerDir, { recursive: true });

			await writeFile(join(dockerDir, "Dockerfile"), result.dockerfile);
			await writeFile(join(dockerDir, ".dockerignore"), result.dockerignore);
			await writeFile(join(dockerDir, "README.md"), result.readme);
			
			// Create build script
			const buildScript = `#!/bin/bash
# Build and run trajectory environment
set -e

IMAGE_NAME="traj-${trajectory.trajectory_id.slice(0, 8)}"

echo "🔨 Building Docker image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" .

echo ""
echo "✅ Build complete!"
echo ""
echo "Run tests:"
echo "  docker run $IMAGE_NAME"
echo ""
echo "Interactive shell:"
echo "  docker run -it $IMAGE_NAME /bin/bash"
`;
			await writeFile(join(dockerDir, "build.sh"), buildScript, { mode: 0o755 });

			ctx.ui.notify(
				`🐳 Docker environment created!\n\n` +
				`   ${dockerDir}/\n` +
				`   ├── Dockerfile\n` +
				`   ├── .dockerignore\n` +
				`   ├── README.md\n` +
				`   └── build.sh\n\n` +
				`To build:\n` +
				`   cd "${dockerDir}" && ./build.sh`,
				"success"
			);
		},
	});

	pi.registerCommand("collective-save", {
		description: "Force save the current trajectory (even if gates fail)",
		handler: async (_args, ctx) => {
			if (!recorder || recorder.isEmpty()) {
				ctx.ui.notify("No trajectory to save - nothing recorded yet", "warning");
				return;
			}

			const gateResults = await runGateChecks(ctx);
			const trajectory = formatTrajectory(recorder, gateResults, startCommit);

			// Mark as forced save
			(trajectory as any).forced_save = true;
			(trajectory as any).gate_failures = gateResults.failures;

			try {
				const stored = await saveTrajectory(trajectory);
				
				let msg = `📊 Trajectory saved (forced)!\n`;
				msg += `   ${stored.trajectoryPath}\n`;
				if (stored.dockerfilePath) {
					msg += `   Dockerfile: ${stored.dockerfilePath}\n`;
				}
				if (gateResults.failures.length > 0) {
					msg += `\n⚠️  Failed gates: ${gateResults.failures.join(", ")}`;
				}
				
				ctx.ui.notify(msg, "success");
			} catch (error) {
				ctx.ui.notify(
					`Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`,
					"error"
				);
			}
		},
	});

	// === TOOLS ===

	pi.registerTool({
		name: "collective_check",
		label: "Collective Check",
		description:
			"Check if the current project is eligible for trajectory sharing with pi-collective. Returns gate check results.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const results = await runGateChecks(ctx);

			return {
				content: [
					{
						type: "text",
						text: results.allPassed
							? "✓ Project is eligible for trajectory sharing"
							: `✗ Not eligible: ${results.failures.join(", ")}`,
					},
				],
				details: results,
			};
		},
	});
}

// === HELPERS ===

interface GateCheckResults {
	allPassed: boolean;
	failures: string[];
	isPublicRepo: boolean;
	repoInfo: { owner: string; repo: string; url: string } | null;
	hasSelfContainedTests: boolean;
	testInfo: { command: string; dockerfile: string } | null;
	noPII: boolean;
	piiFindings: Array<{ type: string; file: string; line: number }>;
	isCommitted: boolean;
	commitInfo: { sha: string; message: string } | null;
}

// Detect git root from a file path (module-level so it can be used in runGateChecks)
async function findGitRoot(filePath: string, cwd: string): Promise<string | null> {
	const { execSync } = await import("child_process");
	const { resolve, dirname, relative } = await import("node:path");
	
	// Resolve the file path
	const absolutePath = resolve(cwd, filePath);
	
	// Skip files outside of cwd (e.g., /tmp clones from web fetches)
	const relPath = relative(cwd, absolutePath);
	if (relPath.startsWith("..") || relPath.startsWith("/")) {
		return null; // File is outside cwd, don't use it for detection
	}
	
	const dir = dirname(absolutePath);
	
	try {
		const gitOpts = { cwd: dir, encoding: "utf-8" as const, stdio: ["pipe", "pipe", "pipe"] as const };
		const root = (execSync("git rev-parse --show-toplevel", gitOpts) as string).trim();
		return root;
	} catch {
		return null;
	}
}

async function runGateChecks(ctx: ExtensionContext): Promise<GateCheckResults> {
	// Try to detect git root from touched files (read/write/edit) if not already detected
	if (!detectedGitRoot && recorder) {
		const touchedFiles = recorder.getTouchedFiles();
		for (const file of touchedFiles) {
			const root = await findGitRoot(file, ctx.cwd);
			if (root) {
				detectedGitRoot = root;
				break;
			}
		}
	}
	
	// Use detected git root if available, otherwise fall back to cwd
	const effectiveRoot = detectedGitRoot || ctx.cwd;
	
	const results: GateCheckResults = {
		allPassed: false,
		failures: [],
		isPublicRepo: false,
		repoInfo: null,
		hasSelfContainedTests: false,
		testInfo: null,
		noPII: false,
		piiFindings: [],
		isCommitted: false,
		commitInfo: null,
	};

	// Gate 1: Public repo
	const repoCheck = await checkPublicRepo(effectiveRoot);
	results.isPublicRepo = repoCheck.isPublic;
	results.repoInfo = repoCheck.info;
	if (!repoCheck.isPublic) {
		results.failures.push(repoCheck.reason || "Not a public GitHub repo");
	}

	// Gate 2: Self-contained tests
	const testCheck = await checkSelfContainedTests(effectiveRoot);
	results.hasSelfContainedTests = testCheck.canRunInDocker;
	results.testInfo = testCheck.canRunInDocker ? { command: testCheck.testCommand!, dockerfile: testCheck.dockerfile! } : null;
	if (!testCheck.canRunInDocker) {
		results.failures.push(testCheck.blockers?.[0] || "Tests not self-contained");
	}

	// Gate 3: PII scan
	const piiCheck = await scanForPII(effectiveRoot);
	results.noPII = piiCheck.clean;
	results.piiFindings = piiCheck.findings;
	if (!piiCheck.clean) {
		results.failures.push(`PII detected: ${piiCheck.findings.length} findings`);
	}

	// Gate 4: Committed (only required if files were modified)
	const modifiedFiles = recorder?.getModifiedFiles() ?? new Set();
	if (modifiedFiles.size > 0) {
		const commitCheck = await checkCommitted(effectiveRoot, startCommit, modifiedFiles);
		results.isCommitted = commitCheck.committed;
		results.commitInfo = commitCheck.info;
		if (!commitCheck.committed) {
			results.failures.push(commitCheck.reason || "Changes not committed");
		}
	} else {
		// Read-only session - no commit required, still valuable for SFT
		results.isCommitted = true; // Mark as OK since there's nothing to commit
	}

	results.allPassed = results.failures.length === 0;
	return results;
}

async function getCurrentCommit(cwd: string): Promise<string | null> {
	try {
		const { execSync } = await import("child_process");
		const result = execSync("git rev-parse HEAD", { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
		return result.trim();
	} catch {
		return null;
	}
}

async function checkCommitted(
	cwd: string,
	startCommit: string | null,
	modifiedFiles: Set<string>
): Promise<{
	committed: boolean;
	reason?: string;
	info: { sha: string; message: string } | null;
}> {
	if (!startCommit) {
		return { committed: false, reason: "Not a git repository", info: null };
	}

	if (modifiedFiles.size === 0) {
		return { committed: false, reason: "No files modified", info: null };
	}

	try {
		const { execSync } = await import("child_process");
		const gitOpts = { cwd, encoding: "utf-8" as const, stdio: ["pipe", "pipe", "pipe"] as const };

		// Check if HEAD has moved
		const currentCommit = (execSync("git rev-parse HEAD", gitOpts) as string).trim();

		if (currentCommit === startCommit) {
			return { committed: false, reason: "No commits made", info: null };
		}

		// Get commit message
		const message = (execSync("git log -1 --pretty=%B", gitOpts) as string).trim();

		// Check if modified files are in the commit
		const committedFiles = (execSync(`git diff --name-only ${startCommit} HEAD`, gitOpts) as string)
			.trim()
			.split("\n")
			.filter(Boolean);

		const allCommitted = [...modifiedFiles].every((f) => committedFiles.includes(f));

		if (!allCommitted) {
			return { committed: false, reason: "Some modified files not committed", info: null };
		}

		return {
			committed: true,
			info: { sha: currentCommit, message },
		};
	} catch {
		return { committed: false, reason: "Git error", info: null };
	}
}
