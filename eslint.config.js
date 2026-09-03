// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["node_modules/", "dist/", "coverage/"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts", "*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  prettier,
);
