import { defineConfig } from '@hey-api/openapi-ts';

// The backend commits openapi.json (CI checks it is current), so the client is generated from it
// on predev/prebuild/pretypecheck and never committed.
export default defineConfig({
  input: '../backend/openapi.json',
  // Extensionless imports: Turbopack doesn't map ./x.js to ./x.ts.
  output: { path: 'src/api/generated', importFileExtension: null },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      // Server-only: adds cookie, secret and IP per request and throws ApiError on non-2xx.
      runtimeConfigPath: './src/server/api',
      throwOnError: true,
    },
    'zod',
    // Every call validates its request body and its response against the contract at runtime.
    { name: '@hey-api/sdk', validator: true },
  ],
});
