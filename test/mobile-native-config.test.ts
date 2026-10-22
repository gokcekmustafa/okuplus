import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const pngSize = (path: string) => {
  const buffer = readFileSync(new URL(path, import.meta.url));
  expect(buffer.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const jpegSize = (path: string) => {
  const buffer = readFileSync(new URL(path, import.meta.url));
  expect(buffer[0]).toBe(0xff);
  expect(buffer[1]).toBe(0xd8);

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker !== undefined && marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker ?? -1,
      )
    ) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }

  throw new Error(`JPEG dimensions were not found in ${path}`);
};

describe("mobile native app identity", () => {
  it("keeps Android, iOS, Capacitor, and the Android device assertion aligned", () => {
    const capacitor = read("../mobile/capacitor.config.ts");
    const androidGradle = read("../mobile/android/app/build.gradle");
    const androidStrings = read("../mobile/android/app/src/main/res/values/strings.xml");
    const androidDeviceTest = read(
      "../mobile/android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java",
    );
    const iosProject = read("../mobile/ios/App/App.xcodeproj/project.pbxproj");

    const appId = capacitor.match(/appId:\s*"([^"]+)"/u)?.[1];
    expect(appId).toBe("com.okupratik.app");
    expect(androidGradle).toContain(`applicationId "${appId}"`);
    expect(androidStrings).toContain(`<string name="package_name">${appId}</string>`);
    expect(androidStrings).toContain(`<string name="custom_url_scheme">${appId}</string>`);
    expect(androidDeviceTest).toContain(`assertEquals("${appId}", appContext.getPackageName())`);

    const iosBundleIds = [...iosProject.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/gu)].map(
      (match) => match[1]?.trim(),
    );
    expect(iosBundleIds.length).toBeGreaterThanOrEqual(2);
    expect(iosBundleIds.every((bundleId) => bundleId === appId)).toBe(true);
  });

  it("ships branded square icons at the required native density sizes", () => {
    const iosContents = JSON.parse(
      read("../mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json"),
    ) as { images: Array<{ filename?: string }> };
    expect(iosContents.images[0]?.filename).toBe("AppIcon-512@2x.png");
    expect(
      pngSize("../mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"),
    ).toEqual({ width: 1024, height: 1024 });

    const densities = [
      { name: "mdpi", icon: 48, foreground: 108 },
      { name: "hdpi", icon: 72, foreground: 162 },
      { name: "xhdpi", icon: 96, foreground: 216 },
      { name: "xxhdpi", icon: 144, foreground: 324 },
      { name: "xxxhdpi", icon: 192, foreground: 432 },
    ];
    for (const density of densities) {
      const base = `../mobile/android/app/src/main/res/mipmap-${density.name}`;
      for (const filename of ["ic_launcher.png", "ic_launcher_round.png"]) {
        expect(pngSize(`${base}/${filename}`)).toEqual({
          width: density.icon,
          height: density.icon,
        });
      }
      expect(pngSize(`${base}/ic_launcher_foreground.png`)).toEqual({
        width: density.foreground,
        height: density.foreground,
      });
    }
    expect(
      statSync(new URL("../mobile/assets/okupratik-app-icon-master.png", import.meta.url)).size,
    ).toBeGreaterThan(0);
  });

  it("ships branded splash screens for Android orientations and iOS", () => {
    const androidSplashSizes = [
      ["drawable/splash.jpg", 480, 320],
      ["drawable-land-hdpi/splash.jpg", 800, 480],
      ["drawable-land-mdpi/splash.jpg", 480, 320],
      ["drawable-land-xhdpi/splash.jpg", 1280, 720],
      ["drawable-land-xxhdpi/splash.jpg", 1600, 960],
      ["drawable-land-xxxhdpi/splash.jpg", 1920, 1280],
      ["drawable-port-hdpi/splash.jpg", 480, 800],
      ["drawable-port-mdpi/splash.jpg", 320, 480],
      ["drawable-port-xhdpi/splash.jpg", 720, 1280],
      ["drawable-port-xxhdpi/splash.jpg", 960, 1600],
      ["drawable-port-xxxhdpi/splash.jpg", 1280, 1920],
    ] as const;

    for (const [resource, width, height] of androidSplashSizes) {
      expect(jpegSize(`../mobile/android/app/src/main/res/${resource}`), resource).toEqual({
        width,
        height,
      });
    }

    const iosSplash = JSON.parse(
      read("../mobile/ios/App/App/Assets.xcassets/Splash.imageset/Contents.json"),
    ) as { images: Array<{ filename?: string }> };
    expect(iosSplash.images).toHaveLength(3);
    for (const image of iosSplash.images) {
      expect(
        jpegSize(`../mobile/ios/App/App/Assets.xcassets/Splash.imageset/${image.filename}`),
      ).toEqual({ width: 2732, height: 2732 });
    }

    expect(
      statSync(new URL("../mobile/assets/okupratik-splash-source.png", import.meta.url)).size,
    ).toBeGreaterThan(0);
  });

  it("bundles the source-audited iOS privacy manifest with user-linked product data and no tracking", () => {
    const manifest = read("../mobile/ios/App/App/PrivacyInfo.xcprivacy");
    const iosProject = read("../mobile/ios/App/App.xcodeproj/project.pbxproj");
    const declaredTypes = [
      ...manifest.matchAll(/<key>NSPrivacyCollectedDataType<\/key>\s*<string>([^<]+)<\/string>/gu),
    ].map((match) => match[1]);

    expect(manifest).toContain("<key>NSPrivacyTracking</key>\n\t<false/>");
    expect(manifest).toContain("<key>NSPrivacyAccessedAPITypes</key>");
    expect(declaredTypes).toEqual([
      "NSPrivacyCollectedDataTypeName",
      "NSPrivacyCollectedDataTypeEmailAddress",
      "NSPrivacyCollectedDataTypePhoneNumber",
      "NSPrivacyCollectedDataTypeUserID",
      "NSPrivacyCollectedDataTypeProductInteraction",
      "NSPrivacyCollectedDataTypeOtherUserContent",
      "NSPrivacyCollectedDataTypePurchaseHistory",
      "NSPrivacyCollectedDataTypeOtherDataTypes",
    ]);
    expect(
      manifest.match(/<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<true\/>/gu),
    ).toHaveLength(declaredTypes.length);
    expect(iosProject).toContain("PrivacyInfo.xcprivacy in Resources");
  });
});
