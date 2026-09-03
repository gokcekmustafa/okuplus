import { spawn } from "node:child_process";

const child =
  process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", "npx tsx scripts/browser-exercise-ux-test.ts"], {
        stdio: "inherit",
      })
    : spawn("npx", ["tsx", "scripts/browser-exercise-ux-test.ts"], { stdio: "inherit" });

child.on("exit", (code) => {
  if (code === 0) console.log("✅ CELEBRATION E2E PASS (real exercise/XP/streak/DB flow)");
  process.exitCode = code ?? 1;
});
