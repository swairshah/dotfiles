import type { BbPluginApi } from "@bb/plugin-sdk";
import {
  DEFAULT_RECENT_WINDOW,
  RECENT_WINDOW_OPTIONS,
} from "./src/settings";

export default function plugin(bb: BbPluginApi) {
  bb.settings.define({
    recentWindow: {
      type: "select",
      label: "Recent thread window",
      description:
        "How long a thread stays in Live threads after its processing finishes.",
      options: [...RECENT_WINDOW_OPTIONS],
      default: DEFAULT_RECENT_WINDOW,
    },
  });

  bb.log.info("Active Threads sidebar loaded");
}
