import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const packagePath = fileURLToPath(
  new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url),
);

readFileSync(packagePath);

writeFileSync(
  packagePath,
  `// swift-tools-version: 5.9
import PackageDescription

// Capacitor 6 plugins are still distributed through CocoaPods by default. The
// mobile shell uses SPM, so keep the secure-storage Swift adapter in the app
// package while retaining the same KeychainSwift-backed implementation.
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v13)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "6.2.2"),
        .package(url: "https://github.com/evgenyneu/keychain-swift.git", from: "21.0.0"),
        .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),
        .package(name: "CapacitorKeyboard", path: "../../../node_modules/@capacitor/keyboard")
    ],
    targets: [
        .target(
            name: "AparajitaCapacitorSecureStorage",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "KeychainSwift", package: "keychain-swift")
            ],
            path: "Sources/AparajitaCapacitorSecureStorage"),
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "AparajitaCapacitorSecureStorage",
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard")
            ]
        )
    ]
)
`,
  'utf8',
);
