import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `const { updatedAt, ...rest } = record` is the idiomatic way to drop a field.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
      // `import { z }` keeps every Zod locale in the browser bundle; the
      // namespace form lets the bundler drop what is unused (docs/decisions/0022).
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value='zod'] > ImportSpecifier[imported.name='z']",
          message: 'Use `import * as z from "zod"` so unused parts of Zod can be tree-shaken.',
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "test-results/**",
    "playwright-report/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
