export default {
  extends: ["@commitlint/config-conventional"],
  ignores: [(message) => /^chore\(deps(-dev)?\): bump/.test(message)],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "web",
        "dashboard",
        "api",
        "db",
        "contracts",
        "tokens",
        "ui",
        "config",
        "infra",
        "docs",
        "ci",
        "deps",
        "deps-dev",
        "repo",
      ],
    ],
  },
};
