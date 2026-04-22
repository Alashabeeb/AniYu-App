const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withCopyVerificationFile(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const src = path.join(config.modRequest.projectRoot, 'assets', 'adi-registration.properties');
      const destDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets');

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(src, path.join(destDir, 'adi-registration.properties'));
      return config;
    },
  ]);
};