// Nest CLI build: bundles src plus the workspace packages (@yoorker/*), which ship
// TypeScript source. Every other package stays external and is required from
// node_modules at runtime, so it must be listed in this package's dependencies.
const path = require("node:path");

module.exports = (options) => ({
  ...options,
  externals: [
    ({ request }, callback) => {
      const isPackage = request && !request.startsWith(".") && !path.isAbsolute(request);
      if (isPackage && !request.startsWith("@yoorker/")) {
        return callback(null, `commonjs ${request}`);
      }
      callback();
    },
  ],
});
