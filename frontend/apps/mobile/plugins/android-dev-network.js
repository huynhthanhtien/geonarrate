const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = function androidDevNetwork(config) {
  config = withAndroidManifest(config, (result) => {
    result.modResults.manifest.application[0].$["android:networkSecurityConfig"] = "@xml/geonarrate_network";
    return result;
  });
  return withDangerousMod(config, ["android", async (result) => {
    const dir = path.join(result.modRequest.platformProjectRoot, "app/src/main/res/xml");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "geonarrate_network.xml"), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- Cho phép HTTP ở tầng hệ điều hành để nhập IP máy chủ ngay trong app (Android không hỗ trợ khai báo theo dải IP).
       Việc chỉ chấp nhận HTTP với mạng nội bộ do parseBackend trong src/api.ts kiểm tra. -->
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`);
    return result;
  }]);
};
