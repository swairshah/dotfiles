/**
 * Syncs pi theme with macOS system appearance (dark/light mode).
 *
 * Customize these if you want different themes for each mode:
 * - DARK_THEME: used when macOS is in dark mode
 * - LIGHT_THEME: used when macOS is in light mode
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const execAsync = promisify(exec);

const DARK_THEME = "atom-one-dark";
const LIGHT_THEME = "light";

async function isDarkMode(): Promise<boolean> {
	try {
		const { stdout } = await execAsync(
			"osascript -e 'tell application \"System Events\" to tell appearance preferences to return dark mode'",
		);
		return stdout.trim() === "true";
	} catch {
		return false;
	}
}

function modeToTheme(isDark: boolean): string {
	return isDark ? DARK_THEME : LIGHT_THEME;
}

export default function (pi: ExtensionAPI) {
	let intervalId: ReturnType<typeof setInterval> | null = null;

	pi.on("session_start", async (_event, ctx) => {
		let currentTheme = modeToTheme(await isDarkMode());
		ctx.ui.setTheme(currentTheme);

		intervalId = setInterval(async () => {
			const newTheme = modeToTheme(await isDarkMode());
			if (newTheme !== currentTheme) {
				currentTheme = newTheme;
				ctx.ui.setTheme(currentTheme);
			}
		}, 2000);
	});

	pi.on("session_shutdown", () => {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	});
}
