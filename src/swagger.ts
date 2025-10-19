import swaggerJSDoc from "swagger-jsdoc"
import swaggerUi from "swagger-ui-express"
import { Express } from "express"

import "./docs/schemas";

export function setupSwagger(app: Express) {
  const options = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "TOEIC API",
        version: "1.0.0",
        description: "Tài liệu API cho hệ thống TOEIC (Express + TypeScript)",
      },
      servers: [
        {
          url: "http://localhost:5000/api",
          description: "Local Server",
        },
      ],
    },
    // Chỉ ra nơi chứa mô tả API
    apis: ["./src/routes/**/*.ts", "./src/docs/schemas/**/*.ts"],
  }

  const swaggerSpec = swaggerJSDoc(options)
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec))
}
