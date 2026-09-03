import { ScryptPasswordHasher } from "../src/modules/auth/password.js";

async function main() {
  const hasher = new ScryptPasswordHasher();

  const adminHash =
    "scrypt$x5Z8MzpRtOlYWiVx2D+l0g==$wmLP1p8cGTOst+r/73tIR1sUBi+eIoxLhVlGrvdl5JOtmj8TeZthTrVRWv6NWNzO8u1C6lgVi7M5yEJIVH2ixw==";
  const demoHash =
    "scrypt$XsgAEEZsNJo+An65kK537g==$Sad2J8ChyVjVmhdCPiU05PWl1SMo7SicErJuGvi9O+er7dFx369KTp9hxs2Ce4rlgac7uSi8RKOYLn0BJ9BuYg==";

  console.log("Admin password test:", await hasher.verify("admin-pass-123", adminHash));
  console.log("Demo password test:", await hasher.verify("demo-pass-123", demoHash));
}

main();
