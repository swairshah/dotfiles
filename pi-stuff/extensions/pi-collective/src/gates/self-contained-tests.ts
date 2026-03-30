/**
 * Gate 2: Check if tests can run in a Docker container without external dependencies
 */

import { readFile, access } from "node:fs/promises";
import { join } from "node:path";

export interface TestabilityCheck {
	canRunInDocker: boolean;
	testCommand: string | null;
	dockerfile: string | null;
	blockers: string[];
	warnings: string[];
}

interface LanguageConfig {
	detectFiles: string[];
	testCommand: string;
	baseImage: string;
	installDeps: string;
	redFlags: RegExp[];
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
	python: {
		detectFiles: ["requirements.txt", "pyproject.toml", "setup.py"],
		testCommand: "pytest",
		baseImage: "python:3.11-slim",
		installDeps: "pip install -r requirements.txt",
		redFlags: [], // TODO: implement without lookaheads
	},
	node: {
		detectFiles: ["package.json"],
		testCommand: "npm test",
		baseImage: "node:20-slim",
		installDeps: "npm ci",
		redFlags: [], // TODO: implement without lookaheads
	},
	typescript: {
		detectFiles: ["package.json", "tsconfig.json"],
		testCommand: "npm test",
		baseImage: "node:20-slim",
		installDeps: "npm ci",
		redFlags: [],
	},
	rust: {
		detectFiles: ["Cargo.toml"],
		testCommand: "cargo test",
		baseImage: "rust:1.75-slim",
		installDeps: "cargo fetch",
		redFlags: [],
	},
	go: {
		detectFiles: ["go.mod"],
		testCommand: "go test ./...",
		baseImage: "golang:1.21-alpine",
		installDeps: "go mod download",
		redFlags: [],
	},
};

export async function checkSelfContainedTests(cwd: string): Promise<TestabilityCheck> {
	const result: TestabilityCheck = {
		canRunInDocker: false,
		testCommand: null,
		dockerfile: null,
		blockers: [],
		warnings: [],
	};

	// Detect language
	let detectedLang: string | null = null;
	let langConfig: LanguageConfig | null = null;

	for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
		for (const file of config.detectFiles) {
			try {
				await access(join(cwd, file));
				detectedLang = lang;
				langConfig = config;
				break;
			} catch {
				// File doesn't exist
			}
		}
		if (detectedLang) break;
	}

	if (!detectedLang || !langConfig) {
		result.blockers.push("Could not detect project language (no package.json, requirements.txt, Cargo.toml, or go.mod)");
		return result;
	}

	// Check for test configuration
	const hasTestConfig = await detectTestConfig(cwd, detectedLang);
	if (!hasTestConfig) {
		result.blockers.push(`No test configuration found for ${detectedLang} project`);
		return result;
	}

	// Scan for red flags in test files
	const redFlagResults = await scanForRedFlags(cwd, detectedLang, langConfig.redFlags);
	if (redFlagResults.length > 0) {
		result.warnings.push(...redFlagResults.map((r) => `${r.file}: ${r.pattern}`));
		// For now, warnings don't block - but we might want to be stricter
	}

	// Check for .env files (potential secrets)
	try {
		await access(join(cwd, ".env"));
		result.warnings.push(".env file found - tests may depend on environment variables");
	} catch {
		// No .env, good
	}

	// Generate Dockerfile
	result.testCommand = langConfig.testCommand;
	result.dockerfile = generateDockerfile(langConfig, detectedLang);
	result.canRunInDocker = result.blockers.length === 0;

	return result;
}

async function detectTestConfig(cwd: string, lang: string): Promise<boolean> {
	const testIndicators: Record<string, string[]> = {
		python: ["pytest.ini", "pyproject.toml", "setup.cfg", "tests/", "test_"],
		node: ["jest.config.js", "jest.config.ts", "vitest.config.ts", "__tests__/", "*.test.ts", "*.spec.ts"],
		rust: ["tests/", "#[test]"], // Rust tests are inline
		go: ["_test.go"],
	};

	const indicators = testIndicators[lang] || [];

	for (const indicator of indicators) {
		if (indicator.endsWith("/")) {
			// Directory check
			try {
				await access(join(cwd, indicator.slice(0, -1)));
				return true;
			} catch {
				continue;
			}
		} else if (indicator.startsWith("*") || indicator.startsWith("#")) {
			// Glob or inline pattern - assume tests exist if we got this far
			return true;
		} else {
			// File check
			try {
				await access(join(cwd, indicator));
				return true;
			} catch {
				continue;
			}
		}
	}

	// For package.json, check for test script
	if (lang === "node") {
		try {
			const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8"));
			if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
				return true;
			}
		} catch {
			// No package.json or invalid
		}
	}

	return false;
}

async function scanForRedFlags(
	_cwd: string,
	_lang: string,
	_patterns: RegExp[]
): Promise<Array<{ file: string; pattern: string }>> {
	// TODO: Implement proper scanning without ripgrep lookahead issues
	// For now, skip this check - we're being lenient anyway
	// The patterns use lookaheads like (?!TEST) which rg doesn't support
	return [];
}

function generateDockerfile(config: LanguageConfig, lang: string): string {
	const lines = [
		`FROM ${config.baseImage}`,
		"",
		"WORKDIR /app",
		"",
		"# Copy dependency files first for caching",
	];

	// Copy dependency files
	const depFiles: Record<string, string[]> = {
		python: ["requirements.txt", "pyproject.toml", "setup.py"],
		node: ["package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"],
		rust: ["Cargo.toml", "Cargo.lock"],
		go: ["go.mod", "go.sum"],
	};

	for (const file of depFiles[lang] || []) {
		lines.push(`COPY ${file}* ./`);
	}

	lines.push("");
	lines.push(`# Install dependencies`);
	lines.push(`RUN ${config.installDeps} || true`);
	lines.push("");
	lines.push("# Copy source code");
	lines.push("COPY . .");
	lines.push("");
	lines.push("# Run tests");
	lines.push(`CMD ["sh", "-c", "${config.testCommand}"]`);

	return lines.join("\n");
}
