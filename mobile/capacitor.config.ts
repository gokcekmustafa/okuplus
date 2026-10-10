import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.okupratik.app",
  appName: "OkuPratik",
  webDir: "www",
  server: {
    androidScheme: "https",
  },
  plugins: {
    Keyboard: {
      resize: "body",
      style: "light",
    },
  },
};

export default config;
