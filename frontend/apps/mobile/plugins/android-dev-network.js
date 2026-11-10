const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = function androidDevNetwork(config) {
  const hosts = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);
  const backend = process.env.EXPO_PUBLIC_API_URL;
  if (backend) {
    const url = new URL(backend);
    if (url.protocol === "http:") {
      if (!/^192\.168\.\d{1,3}\.\d{1,3}$|^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(url.hostname) && !hosts.has(url.hostname)) {
        throw new Error("HTTP chỉ được dùng với địa chỉ backend nội bộ. Dùng HTTPS cho địa chỉ công khai.");
      }
      hosts.add(url.hostname);
    }
  }

  config = withAndroidManifest(config, (result) => {
    result.modResults.manifest.application[0].$["android:networkSecurityConfig"] = "@xml/geonarrate_network";
    return result;
  });
  return withDangerousMod(config, ["android", async (result) => {
    const dir = path.join(result.modRequest.platformProjectRoot, "app/src/main/res/xml");
    await fs.mkdir(dir, { recursive: true });
    const domains = [...hosts].map((host) => `    <domain includeSubdomains="false">${host}</domain>`).join("\n");
    await fs.writeFile(path.join(dir, "geonarrate_network.xml"), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
${domains}
  </domain-config>
</network-security-config>
`);
    return result;
  }]);
};
