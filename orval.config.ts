import { defineConfig } from 'orval';
export default defineConfig({
  api: {
    input: {
      target: './v1schema/schema.json', // path to your exported schema JSON or a URL
      unsafeDisableValidation: true
    },
    output: {
      mode: 'tags-split', // or 'single', 'split'
      target: 'src/app/core/api/endpoints',
      schemas: 'src/app/core/api/models',
      client: 'angular', // Generates Angular HttpClient services; alternatively 'fetch' or 'axios'
      httpClient: 'angular'
    },
  },
});
