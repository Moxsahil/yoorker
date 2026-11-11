export default {
  extends: ["@commitlint/config-conventional"],
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
        "repo",
      ],
    ],
  },
};
