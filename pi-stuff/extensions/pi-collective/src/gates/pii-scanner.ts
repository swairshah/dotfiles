/**
 * Gate 3: Scan for Personally Identifiable Information (PII)
 * 
 * Respects .gitignore and skips sensitive files like .env
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export interface PIIScanResult {
	clean: boolean;
	findings: Array<{
		type: string;
		file: string;
		line: number;
		severity: "high" | "medium" | "low";
		snippet?: string; // Redacted snippet for context
	}>;
}

interface PIIPattern {
	name: string;
	pattern: RegExp;
	severity: "high" | "medium" | "low";
	falsePositiveCheck?: (match: string, context: string) => boolean;
}

const PII_PATTERNS: PIIPattern[] = [
	// API Keys & Secrets (HIGH)
	{
		name: "AWS Access Key",
		pattern: /AKIA[0-9A-Z]{16}/g,
		severity: "high",
	},
	{
		name: "AWS Secret Key",
		pattern: /aws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi,
		severity: "high",
	},
	{
		name: "OpenAI API Key",
		pattern: /sk-[a-zA-Z0-9]{32,}/g,
		severity: "high",
	},
	{
		name: "Anthropic API Key",
		pattern: /sk-ant-[a-zA-Z0-9-]{32,}/g,
		severity: "high",
	},
	{
		name: "GitHub Token",
		pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
		severity: "high",
	},
	{
		name: "Private Key",
		pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
		severity: "high",
	},
	{
		name: "Generic Secret Assignment",
		pattern: /(?:password|secret|token|api_key|apikey|auth)\s*[=:]\s*['"][^'"]{8,}['"]/gi,
		severity: "high",
		falsePositiveCheck: (match, context) => {
			// Ignore if it looks like a placeholder
			return /(?:example|placeholder|your_|changeme|xxx|test)/i.test(match);
		},
	},

	// Database URLs with credentials (HIGH)
	{
		name: "Database URL with Credentials",
		pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^/]+/gi,
		severity: "high",
	},

	// Email Addresses (MEDIUM) - DISABLED for now, too many false positives
	// {
	// 	name: "Email Address",
	// 	pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
	// 	severity: "medium",
	// 	falsePositiveCheck: (match, context) => {
	// 		// Ignore common fake/test emails
	// 		if (/example\.com|test\.com|localhost|noreply|@users\.noreply\.github\.com/i.test(match)) {
	// 			return true;
	// 		}
	// 		// Ignore if in a LICENSE, README, or package file
	// 		if (/LICENSE|README|package\.json|Cargo\.toml|pyproject\.toml/i.test(context)) {
	// 			return true;
	// 		}
	// 		return false;
	// 	},
	// },

	// IP Addresses - DISABLED, too many false positives (version numbers, etc.)
	// Phone Numbers - DISABLED, too many false positives
	// SSN - DISABLED, too many false positives (date formats, etc.)
	// Credit Card - DISABLED, too many false positives (random numbers in code)
];

// NOTE: We're being conservative here and only scanning for HIGH severity
// secrets (API keys, private keys, passwords). The other patterns have
// too many false positives in code repositories.

// Files to ALWAYS skip (sensitive by nature)
const ALWAYS_SKIP_FILES = [
	".env",
	".env.local",
	".env.development",
	".env.production",
	".env.test",
	".env.staging",
	".envrc",
	".npmrc",
	".yarnrc",
	".docker-env",
	"secrets.json",
	"secrets.yaml",
	"secrets.yml",
	".secrets",
];

// Directories/patterns to skip
const SKIP_PATTERNS = [
	/node_modules/,
	/\.git/,
	/\.venv/,
	/venv/,
	/^\.env/,  // Any .env* file
	/__pycache__/,
	/target\/debug/,
	/target\/release/,
	/dist/,
	/build/,
	/\.next/,
	/\.nuxt/,
	/\.output/,
	/coverage/,
	/\.nyc_output/,
	/\.cache/,
	/\.parcel-cache/,
	/\.turbo/,
	/\.vercel/,
	/\.netlify/,
	/vendor/,
	/\.bundle/,
	/Pods/,
	/\.gradle/,
	/\.idea/,
	/\.vscode/,
	/\.lock$/,
	/package-lock\.json$/,
	/yarn\.lock$/,
	/pnpm-lock\.yaml$/,
	/Cargo\.lock$/,
	/Gemfile\.lock$/,
	/poetry\.lock$/,
	/composer\.lock$/,
	/\.min\.js$/,
	/\.min\.css$/,
	/\.map$/,
	/\.wasm$/,
	/\.png$/,
	/\.jpg$/,
	/\.jpeg$/,
	/\.gif$/,
	/\.ico$/,
	/\.svg$/,
	/\.webp$/,
	/\.pdf$/,
	/\.zip$/,
	/\.tar/,
	/\.gz$/,
	/\.bz2$/,
	/\.7z$/,
	/\.rar$/,
	/\.ttf$/,
	/\.woff/,
	/\.eot$/,
	/\.otf$/,
	/\.mp3$/,
	/\.mp4$/,
	/\.wav$/,
	/\.avi$/,
	/\.mov$/,
	/\.db$/,
	/\.sqlite/,
	/\.pyc$/,
	/\.pyo$/,
	/\.so$/,
	/\.dylib$/,
	/\.dll$/,
	/\.exe$/,
	/\.o$/,
	/\.a$/,
];

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_FILES_TO_SCAN = 500; // Don't scan more than this many files
let filesScanned = 0;

/**
 * Parse .gitignore file and return a function that checks if a path should be ignored
 */
async function loadGitignore(cwd: string): Promise<(relativePath: string) => boolean> {
	const ignorePatterns: Array<{ pattern: RegExp; negated: boolean }> = [];
	
	try {
		const gitignorePath = join(cwd, ".gitignore");
		const content = await readFile(gitignorePath, "utf-8");
		
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			
			// Skip empty lines and comments
			if (!trimmed || trimmed.startsWith("#")) {
				continue;
			}
			
			// Check for negation
			const negated = trimmed.startsWith("!");
			const pattern = negated ? trimmed.slice(1) : trimmed;
			
			// Convert gitignore pattern to regex
			const regex = gitignorePatternToRegex(pattern);
			if (regex) {
				ignorePatterns.push({ pattern: regex, negated });
			}
		}
	} catch {
		// No .gitignore or can't read it - that's fine
	}
	
	return (relativePath: string): boolean => {
		let ignored = false;
		
		for (const { pattern, negated } of ignorePatterns) {
			if (pattern.test(relativePath) || pattern.test(relativePath + "/")) {
				ignored = !negated;
			}
		}
		
		return ignored;
	};
}

/**
 * Convert a gitignore pattern to a RegExp
 */
function gitignorePatternToRegex(pattern: string): RegExp | null {
	try {
		let regexStr = pattern
			// Escape special regex characters (except * and ?)
			.replace(/[.+^${}()|[\]\\]/g, "\\$&")
			// ** matches any path
			.replace(/\*\*/g, ".*")
			// * matches anything except /
			.replace(/\*/g, "[^/]*")
			// ? matches single char except /
			.replace(/\?/g, "[^/]");
		
		// If pattern starts with /, anchor to root
		if (pattern.startsWith("/")) {
			regexStr = "^" + regexStr.slice(2); // Remove the escaped \/
		} else {
			// Otherwise can match anywhere
			regexStr = "(^|/)" + regexStr;
		}
		
		// If pattern ends with /, it only matches directories
		// For our purposes, we treat it as matching the directory and contents
		if (pattern.endsWith("/")) {
			regexStr = regexStr.slice(0, -2) + "(/|$)";
		} else {
			regexStr = regexStr + "($|/)";
		}
		
		return new RegExp(regexStr);
	} catch {
		return null;
	}
}

export async function scanForPII(cwd: string): Promise<PIIScanResult> {
	const findings: PIIScanResult["findings"] = [];
	filesScanned = 0;
	
	// Load .gitignore patterns
	const isGitignored = await loadGitignore(cwd);

	async function scanDirectory(dir: string) {
		if (filesScanned >= MAX_FILES_TO_SCAN) {
			return; // Stop scanning if we've hit the limit
		}
		try {
			const entries = await readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(dir, entry.name);
				const relativePath = relative(cwd, fullPath);

				// Skip if it's an always-skip file (like .env)
				if (ALWAYS_SKIP_FILES.includes(entry.name)) {
					continue;
				}

				// Skip if matches skip pattern
				if (SKIP_PATTERNS.some((p) => p.test(relativePath) || p.test(entry.name))) {
					continue;
				}
				
				// Skip if gitignored
				if (isGitignored(relativePath)) {
					continue;
				}

				if (entry.isDirectory()) {
					await scanDirectory(fullPath);
				} else if (entry.isFile()) {
					await scanFile(fullPath, relativePath);
				}
			}
		} catch {
			// Skip directories we can't read
		}
	}

	async function scanFile(fullPath: string, relativePath: string) {
		if (filesScanned >= MAX_FILES_TO_SCAN) {
			return;
		}
		filesScanned++;

		try {
			// Check file size
			const stats = await stat(fullPath);
			if (stats.size > MAX_FILE_SIZE) {
				return; // Skip large files
			}

			const content = await readFile(fullPath, "utf-8");
			const lines = content.split("\n");

			for (let lineNum = 0; lineNum < lines.length; lineNum++) {
				const line = lines[lineNum];

				for (const piiPattern of PII_PATTERNS) {
					// Reset regex state
					piiPattern.pattern.lastIndex = 0;

					let match;
					while ((match = piiPattern.pattern.exec(line)) !== null) {
						// Check for false positives
						if (piiPattern.falsePositiveCheck?.(match[0], relativePath)) {
							continue;
						}

						findings.push({
							type: piiPattern.name,
							file: relativePath,
							line: lineNum + 1,
							severity: piiPattern.severity,
							snippet: redactMatch(line, match.index, match[0].length),
						});
					}
				}
			}
		} catch {
			// Skip files we can't read (binary, etc.)
		}
	}

	await scanDirectory(cwd);

	return {
		clean: findings.length === 0,
		findings,
	};
}

function redactMatch(line: string, matchStart: number, matchLength: number): string {
	// Show context but redact the actual match
	const before = line.slice(Math.max(0, matchStart - 10), matchStart);
	const after = line.slice(matchStart + matchLength, matchStart + matchLength + 10);
	const redacted = "*".repeat(Math.min(matchLength, 8));

	return `...${before}${redacted}${after}...`.trim();
}
