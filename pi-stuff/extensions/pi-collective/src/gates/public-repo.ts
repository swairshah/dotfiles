/**
 * Gate 1: Check if the project is a public GitHub repository
 */

export interface PublicRepoCheck {
	isPublic: boolean;
	reason?: string;
	info: {
		owner: string;
		repo: string;
		url: string;
		license?: string;
	} | null;
}

export async function checkPublicRepo(cwd: string): Promise<PublicRepoCheck> {
	try {
		const { execSync } = await import("child_process");
		const gitOpts = { cwd, encoding: "utf-8" as const, stdio: ["pipe", "pipe", "pipe"] as const };

		// Get remote URL
		let remoteUrl: string;
		try {
			remoteUrl = (execSync("git remote get-url origin", gitOpts) as string).trim();
		} catch {
			return { isPublic: false, reason: "No git remote 'origin' found", info: null };
		}

		// Parse GitHub URL
		const parsed = parseGitHubUrl(remoteUrl);
		if (!parsed) {
			return { isPublic: false, reason: "Not a GitHub repository", info: null };
		}

		// Check GitHub API (unauthenticated)
		const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;

		try {
			const response = await fetch(apiUrl, {
				headers: {
					Accept: "application/vnd.github.v3+json",
					"User-Agent": "pi-collective",
				},
			});

			if (response.status === 404) {
				return { isPublic: false, reason: "Repository not found on GitHub", info: null };
			}

			if (!response.ok) {
				return { isPublic: false, reason: `GitHub API error: ${response.status}`, info: null };
			}

			const data = (await response.json()) as { private: boolean; license?: { spdx_id: string } };

			if (data.private) {
				return { isPublic: false, reason: "Repository is private", info: null };
			}

			return {
				isPublic: true,
				info: {
					owner: parsed.owner,
					repo: parsed.repo,
					url: `https://github.com/${parsed.owner}/${parsed.repo}`,
					license: data.license?.spdx_id,
				},
			};
		} catch (error) {
			return {
				isPublic: false,
				reason: `Failed to check GitHub: ${error instanceof Error ? error.message : "Unknown error"}`,
				info: null,
			};
		}
	} catch {
		return { isPublic: false, reason: "Not a git repository", info: null };
	}
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
	// SSH format: git@github.com:owner/repo.git
	const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (sshMatch) {
		return { owner: sshMatch[1], repo: sshMatch[2] };
	}

	// HTTPS format: https://github.com/owner/repo.git
	const httpsMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (httpsMatch) {
		return { owner: httpsMatch[1], repo: httpsMatch[2] };
	}

	return null;
}
