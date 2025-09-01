module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
    "tests/**/*", // Ignore test files.
    "node_modules/**/*", // Ignore node_modules.
    ".eslintrc.js", // Ignore ESLint config file.
    "jest.config.ts", // Ignore Jest config file.
    "scripts/**/*", // Ignore scripts.
  ],
  plugins: [
    "@typescript-eslint",
    "import",
    "prettier",
  ],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    "indent": ["warn", 2],
    "object-curly-spacing": 0,
    "max-len": ["error", { "code": 12400 }],
    "require-jsdoc": 0,
    "valid-jsdoc": 0,
    "new-cap": 0,
    "operator-linebreak": 0,
    "import/export": 0,
    "no-invalid-this": 0,
    "space-before-function-paren": 0,
  },
};
