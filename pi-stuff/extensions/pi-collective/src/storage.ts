/**
 * Local Storage for Trajectories
 * 
 * Stores trajectories in ~/.pi/collective/ for local inspection.
 * Later we can add S3 upload on top of this.
 */

import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Trajectory } from "./trajectory.js";

const COLLECTIVE_DIR = join(homedir(), ".pi", "collective");
const TRAJECTORIES_DIR = join(COLLECTIVE_DIR, "trajectories");
const DOCKERFILES_DIR = join(COLLECTIVE_DIR, "dockerfiles");

export interface StoredTrajectory {
	trajectory: Trajectory;
	trajectoryPath: string;
	dockerfilePath: string | null;
}

/**
 * Initialize the local storage directories
 */
export async function initStorage(): Promise<void> {
	await mkdir(TRAJECTORIES_DIR, { recursive: true });
	await mkdir(DOCKERFILES_DIR, { recursive: true });
}

/**
 * Save a trajectory to local storage
 */
export async function saveTrajectory(trajectory: Trajectory): Promise<StoredTrajectory> {
	await initStorage();

	const id = trajectory.trajectory_id;
	const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

	// Save trajectory JSON
	const trajectoryFilename = `${date}_${id}.json`;
	const trajectoryPath = join(TRAJECTORIES_DIR, trajectoryFilename);
	await writeFile(trajectoryPath, JSON.stringify(trajectory, null, 2), "utf-8");

	// Save Dockerfile separately for easy access
	let dockerfilePath: string | null = null;
	if (trajectory.environment.dockerfile) {
		const dockerfileDir = join(DOCKERFILES_DIR, id);
		await mkdir(dockerfileDir, { recursive: true });

		dockerfilePath = join(dockerfileDir, "Dockerfile");
		await writeFile(dockerfilePath, trajectory.environment.dockerfile, "utf-8");

		// Also write a README
		const readme = generateDockerfileReadme(trajectory);
		await writeFile(join(dockerfileDir, "README.md"), readme, "utf-8");

		// And a build script
		const buildScript = generateBuildScript(trajectory);
		await writeFile(join(dockerfileDir, "build.sh"), buildScript, { mode: 0o755 });
	}

	return {
		trajectory,
		trajectoryPath,
		dockerfilePath,
	};
}

/**
 * List all stored trajectories
 */
export async function listTrajectories(): Promise<string[]> {
	try {
		await initStorage();
		const files = await readdir(TRAJECTORIES_DIR);
		return files.filter(f => f.endsWith(".json")).sort().reverse();
	} catch {
		return [];
	}
}

/**
 * Load a trajectory by filename
 */
export async function loadTrajectory(filename: string): Promise<Trajectory | null> {
	try {
		const path = join(TRAJECTORIES_DIR, filename);
		const content = await readFile(path, "utf-8");
		return JSON.parse(content) as Trajectory;
	} catch {
		return null;
	}
}

/**
 * Get the storage directory path
 */
export function getStorageDir(): string {
	return COLLECTIVE_DIR;
}

/**
 * Get statistics about stored trajectories
 */
export async function getStorageStats(): Promise<{
	totalTrajectories: number;
	totalSize: string;
	oldestDate: string | null;
	newestDate: string | null;
}> {
	const files = await listTrajectories();
	
	if (files.length === 0) {
		return {
			totalTrajectories: 0,
			totalSize: "0 KB",
			oldestDate: null,
			newestDate: null,
		};
	}

	// Extract dates from filenames (format: YYYY-MM-DD_uuid.json)
	const dates = files
		.map(f => f.split("_")[0])
		.filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
		.sort();

	// Calculate total size
	let totalBytes = 0;
	for (const file of files) {
		try {
			const content = await readFile(join(TRAJECTORIES_DIR, file), "utf-8");
			totalBytes += content.length;
		} catch {
			// Skip files we can't read
		}
	}

	const sizeStr = totalBytes < 1024
		? `${totalBytes} B`
		: totalBytes < 1024 * 1024
			? `${(totalBytes / 1024).toFixed(1)} KB`
			: `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;

	return {
		totalTrajectories: files.length,
		totalSize: sizeStr,
		oldestDate: dates[0] ?? null,
		newestDate: dates[dates.length - 1] ?? null,
	};
}

function generateDockerfileReadme(trajectory: Trajectory): string {
	return `# Trajectory Environment

## ID
\`${trajectory.trajectory_id}\`

## Source
- **Repository**: ${trajectory.source.repo_url}
- **Commit**: \`${trajectory.source.commit_before}\`
- **Language**: ${trajectory.source.language_primary}
- **License**: ${trajectory.source.repo_license ?? "Unknown"}

## Quick Start

\`\`\`bash
# Build the Docker image
./build.sh

# Or manually:
docker build -t traj-${trajectory.trajectory_id.slice(0, 8)} .

# Run tests
docker run traj-${trajectory.trajectory_id.slice(0, 8)}

# Interactive shell (you're now at the exact state where this trajectory started)
docker run -it traj-${trajectory.trajectory_id.slice(0, 8)} /bin/bash
\`\`\`

## Task
${trajectory.messages.find(m => m.role === "user")?.content ?? "N/A"}

## Outcome
- **Success**: ${trajectory.outcome.success ? "✅" : "❌"}
- **Tests Passed**: ${trajectory.outcome.tests_passed ? "✅" : "❌"}
- **Committed**: ${trajectory.outcome.committed ? "✅" : "❌"}
- **Reward**: ${trajectory.reward}

## Files Changed
${trajectory.outcome.files_changed.map(f => `- \`${f}\``).join("\n")}

## Timestamp
${trajectory.timestamp}
`;
}

function generateBuildScript(trajectory: Trajectory): string {
	const shortId = trajectory.trajectory_id.slice(0, 8);
	return `#!/bin/bash
# Build script for trajectory ${trajectory.trajectory_id}

set -e

IMAGE_NAME="traj-${shortId}"

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
echo ""
`;
}
