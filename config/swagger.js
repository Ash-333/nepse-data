import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load swagger JSON
const swaggerDocument = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../swagger.json'), 'utf8')
);

// Swagger UI options
const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #3b82f6 }
  `,
  customSiteTitle: "IPO Alert API Documentation",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2
  }
};

export function setupSwagger(app) {
  // Serve swagger documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));
  
  // Serve raw swagger JSON
  app.get('/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocument);
  });
  
  console.log('📚 Swagger documentation available at:');
  console.log('   - UI: /api-docs');
  console.log('   - JSON: /swagger.json');
}